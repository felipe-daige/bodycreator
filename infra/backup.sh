#!/usr/bin/env bash
#
# Backup diário do Postgres de produção para o R2.
#
# Este script roda no VPS (Linux/Ubuntu), agendado via cron — ver
# "Backup e restauração" em docs/OPERACAO.md. Ele usa `date -u -d` e
# `stat -c%s`, que são GNU coreutils: funcionam no Ubuntu do VPS mas NÃO em
# macOS/BSD sem coreutils GNU instalado. Não rode isto fora do VPS.
#
# Depende do AWS CLI (`aws`) configurado para falar com o R2 — ver instalação
# em docs/OPERACAO.md. Lê as credenciais do `.env` de produção; nenhum
# segredo fica neste arquivo.
set -euo pipefail

cd /opt/bodycreator
# shellcheck disable=SC1091 # .env só existe no VPS, nunca no repositório.
source .env

# O AWS CLI lê AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY (ou um profile em
# ~/.aws/credentials) — não as variáveis R2_* do .env. Em vez de manter
# credenciais duplicadas em dois lugares (o .env e um ~/.aws/credentials à
# parte, que ninguém lembra de atualizar junto quando a chave gira),
# reexportamos aqui as mesmas credenciais que a API já usa para falar com o
# R2 (Task 10).
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
# O R2 ignora a região na prática, mas o AWS CLI exige alguma pra assinar a
# requisição (SigV4). "auto" é o valor que a própria Cloudflare recomenda.
export AWS_DEFAULT_REGION=auto

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="bodycreator-${STAMP}.sql.gz"
TMP="/tmp/${FILE}"

# --no-owner/--no-privileges: o dump não deve depender de a role de produção
# (POSTGRES_USER) existir tal e qual no destino da restauração. Sem isso,
# toda restauração — tanto o container descartável do restore-check.sh
# quanto uma reconstrução de desastre com .env novo — imprime "role ... does
# not exist" para cada ALTER TABLE ... OWNER TO. É inofensivo (psql segue em
# frente), mas polui o log do cron com "erros" que não são falha real,
# exatamente o tipo de ruído que faz alguém ignorar o log até ser tarde.
docker compose exec -T db pg_dump --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip -9 > "$TMP"

# Dump vazio ou minúsculo indica falha silenciosa (ex.: pg_dump falhou mas o
# gzip de um stream vazio ainda produz um arquivo): melhor falhar alto agora
# do que descobrir na hora de restaurar.
SIZE=$(stat -c%s "$TMP")
if [ "$SIZE" -lt 1024 ]; then
  echo "ERRO: dump com apenas ${SIZE} bytes — abortando." >&2
  rm -f "$TMP"
  exit 1
fi

aws s3 cp "$TMP" "s3://${R2_BUCKET}/backups/${FILE}" \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

rm -f "$TMP"

# Retenção de 30 dias — falha nesta etapa não deve abortar o backup do dia,
# que já completou com sucesso acima. Se a limpeza antiga falhar, avisa mas
# continua (o upload de hoje está garantido).
{
  CUTOFF=$(date -u -d '30 days ago' +%Y%m%d)
  aws s3 ls "s3://${R2_BUCKET}/backups/" \
    --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
    | awk '{print $4}' | while read -r name; do
        d=$(echo "$name" | sed -n 's/bodycreator-\([0-9]\{8\}\)T.*/\1/p')
        [ -n "$d" ] && [ "$d" -lt "$CUTOFF" ] && \
          aws s3 rm "s3://${R2_BUCKET}/backups/${name}" \
            --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
      done
} || echo "AVISO: falha ao limpar backups antigos (retenção) — o backup de hoje foi registrado com sucesso."

echo "Backup concluído: ${FILE} (${SIZE} bytes)"
