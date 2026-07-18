#!/usr/bin/env bash
#
# Restauração verificada, mensal, num container Postgres descartável — a
# única forma de saber se o backup diário (backup.sh) presta pra alguma
# coisa quando for realmente preciso. Roda no VPS (Linux/Ubuntu) via cron —
# ver "Backup e restauração" em docs/OPERACAO.md.
#
# Depende do AWS CLI (`aws`), igual ao backup.sh. Lê as credenciais do
# `.env` de produção; nenhum segredo fica neste arquivo.
set -euo pipefail

cd /opt/bodycreator
# shellcheck disable=SC1091 # .env só existe no VPS, nunca no repositório.
source .env

# Ver comentário equivalente em backup.sh: o AWS CLI usa AWS_ACCESS_KEY_ID/
# AWS_SECRET_ACCESS_KEY, não as variáveis R2_* do .env.
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION=auto

LATEST=$(aws s3 ls "s3://${R2_BUCKET}/backups/" \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  | sort | tail -1 | awk '{print $4}')

if [ -z "$LATEST" ]; then
  echo "ERRO: nenhum backup encontrado em s3://${R2_BUCKET}/backups/." >&2
  exit 1
fi

echo "Verificando restauração de ${LATEST}"
aws s3 cp "s3://${R2_BUCKET}/backups/${LATEST}" /tmp/check.sql.gz \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Container descartável, isolado do banco de produção. O trap roda mesmo se
# alguma verificação abaixo falhar (é o que `set -e` + `exit 1` aciona) —
# sem isso, o segundo run do mês colidiria com o container `restore-check`
# ainda vivo do primeiro (docker run --name falharia por nome duplicado).
# Limpeza defensiva: se uma execução anterior morrer sem rodar o trap (SIGKILL,
# queda do VPS), o container fica, então todos os runs seguintes falham.
docker rm -f restore-check >/dev/null 2>&1 || true
docker run -d --name restore-check -e POSTGRES_PASSWORD=check postgres:16-alpine >/dev/null
trap 'rm -f /tmp/check.sql.gz; docker rm -f restore-check >/dev/null 2>&1 || true' EXIT

# Espera o Postgres do container ficar pronto, com limite de 60s — sem
# limite, um container que nunca sobe trava o cron pra sempre em vez de
# falhar de forma visível no log.
TRIES=0
until docker exec restore-check pg_isready -U postgres >/dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -ge 60 ]; then
    echo "ERRO: container de restauração não ficou pronto em 60s." >&2
    exit 1
  fi
  sleep 1
done

# ON_ERROR_STOP=1: um erro real durante a restauração (ex.: SQL corrompido
# no dump) precisa abortar o script, não ser engolido silenciosamente pelo
# psql e mascarado pelas checagens de contagem logo abaixo.
gunzip -c /tmp/check.sql.gz | docker exec -i restore-check psql -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null

TABELAS=$(docker exec restore-check psql -U postgres -d postgres -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")

# 7 tabelas do schema atual (server/src/db/schema.ts): users, invites, packs,
# categories, stickers, catalog_versions, audit_log. Valor confirmado contra
# uma restauração real (não só contra o schema): a tabela de controle de
# migrações do Drizzle (__drizzle_migrations) vive no schema "drizzle", não
# em "public", então não entra nesta contagem.
if [ "$TABELAS" -lt 7 ]; then
  echo "FALHA: restauração trouxe apenas ${TABELAS} tabelas." >&2
  exit 1
fi

# Verificar tabelas E usuários é deliberado: um dump que restaura o esquema
# mas perdeu os dados passaria numa checagem que só olha tabelas.
USUARIOS=$(docker exec restore-check psql -U postgres -d postgres -tAc "SELECT count(*) FROM users")
if [ "$USUARIOS" -lt 1 ]; then
  echo "FALHA: banco restaurado sem nenhum usuário." >&2
  exit 1
fi

echo "OK: restauração verificada — ${TABELAS} tabelas, ${USUARIOS} usuários."
