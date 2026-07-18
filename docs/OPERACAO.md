# Operação — Body Creator API em produção

Este documento descreve como colocar o backend (`server/`) no ar num VPS e operar
esse ambiente. A administração vive no app iOS; não existe painel web em produção.
Não há credenciais reais aqui — todo valor de exemplo precisa ser substituído.

## Arquitetura em produção

Um único VPS roda três containers via `infra/docker-compose.yml`:

- **`db`** — Postgres 16, dado persistido no volume `pgdata`.
- **`api`** — a API Fastify (`server/`), imagem `ghcr.io/<repo>/api`.
- **`caddy`** — único ponto de entrada HTTP(S) público. Faz proxy reverso do
  domínio da API para `api:3000`; TLS é automático (Let's Encrypt via Caddy).

O app usa cookie `httpOnly` na própria sessão nativa do `URLSession`. A API e o
CDN/R2 podem ter domínios diferentes: a autenticação só viaja para a API, enquanto
manifestos e PNGs publicados são públicos no CDN.

## Pré-requisitos

- Um VPS com Ubuntu (22.04 ou mais recente) na região desejada (ex.: São Paulo).
- Um domínio (ou subdomínio) apontando, via registro DNS A/AAAA, para o IP do VPS
  **antes** de subir o Caddy pela primeira vez — sem DNS resolvendo, a emissão
  automática do certificado TLS falha (e fica tentando de novo indefinidamente).
- Acesso SSH ao VPS com um usuário com privilégio de `sudo` para o provisionamento.
- Um repositório no GitHub com este código, Actions habilitado, e permissão para
  criar secrets do repositório.

---

## Provisionamento do zero

Siga esta seção uma vez, para levar um VPS limpo até o primeiro deploy funcionando.
Rode os comandos de VPS logado nele por SSH.

### 1. Usuário de deploy

Não use `root` para o dia a dia nem para o deploy automático. Crie um usuário
dedicado com sudo e acesso ao grupo `docker` (criado no passo 3):

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy
# depois de instalar o Docker (passo 3):
sudo usermod -aG docker deploy
```

A partir daqui, os comandos assumem que você está logado como `deploy` (ou
equivalente).

### 2. Endurecer o VPS

```bash
# SSH somente por chave — nunca por senha
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# Firewall: nega tudo por padrão, libera só SSH, HTTP e HTTPS
sudo ufw default deny incoming && sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable

# Atualizações de segurança automáticas
sudo apt install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
```

Antes de rodar o primeiro comando acima, confirme que já existe **pelo menos uma
chave pública sua** em `~/.ssh/authorized_keys` — desativar `PasswordAuthentication`
sem isso tranca o acesso ao servidor.

### 3. Instalar Docker Engine e o plugin Compose

O brief de endurecimento não cobre isto, mas sem Docker nada mais funciona:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# saia e entre de novo por SSH para o grupo novo valer, depois confirme:
docker compose version
```

### 4. Preparar `/opt/bodycreator`

```bash
sudo mkdir -p /opt/bodycreator
sudo chown "$USER":"$USER" /opt/bodycreator
```

Copie `infra/docker-compose.yml` e `infra/Caddyfile` do repositório para dentro
dessa pasta (por `scp`, a partir da sua máquina, apontando para o `deploy@VPS_HOST`):

```bash
scp infra/docker-compose.yml infra/Caddyfile deploy@<VPS_HOST>:/opt/bodycreator/
```

(O workflow `deploy.yml` faz essa mesma cópia sozinho a cada deploy — este passo
manual é só para a primeira vez, antes de o Actions existir.)

### 5. Onde fica o `.env` e o que ele contém

O `.env` de produção mora **só no servidor**, em `/opt/bodycreator/.env` — nunca é
commitado (está em `.gitignore` como `infra/.env`; o do servidor é o mesmo
conteúdo, arquivo local). Ele serve dois papéis ao mesmo tempo: o Compose lê essas
variáveis para preencher `${...}` dentro de `docker-compose.yml`, **e**
`env_file: [.env]` injeta as mesmas variáveis dentro do container da API.

Copie `infra/.env.example` do repositório para `/opt/bodycreator/.env` e preencha:

```bash
scp infra/.env.example deploy@<VPS_HOST>:/opt/bodycreator/.env
# no servidor: editar com as credenciais reais
nano /opt/bodycreator/.env
chmod 600 /opt/bodycreator/.env
```

Pontos de atenção ao preencher (documentados também nos comentários do próprio
`.env.example`):

- `GH_REPO` precisa ser o nome do repositório do GitHub **em minúsculas**
  (`usuario/bodycreator`) — é como o GHCR nomeia as imagens.
- `SESSION_SECRET` precisa de 32+ caracteres aleatórios. Gere com
  `openssl rand -base64 32` — nunca reaproveite um valor de exemplo.
- `API_DOMAIN` é o host público usado pelo app (o mesmo configurado como
  `API_BASE_URL` de Release em `project.yml`).
- `PUBLIC_APP_INVITE_URL` deve permanecer `bodycreator://convite`; é o link que
  abre a tela nativa de aceite de convite.
- `DATABASE_URL` **repete** o usuário/senha/banco de `POSTGRES_USER` /
  `POSTGRES_PASSWORD` / `POSTGRES_DB` por extenso — `env_file` não expande
  `${VAR}` referenciando outra variável do mesmo arquivo, então não dá pra
  compor a URL a partir das outras três.
- `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` **não vão neste arquivo** — são
  passadas na hora, uma única vez, no comando do passo 7. Deixá-las num `.env`
  persistente seria mais uma forma de a senha do primeiro admin vazar para
  qualquer coisa que leia esse arquivo depois.

### 6. Se as imagens do GHCR forem privadas

Se o repositório do GitHub (e portanto os pacotes publicados no GHCR) for privado,
o VPS precisa de credenciais para `docker compose pull` funcionar. Crie um GitHub
Personal Access Token (classic ou fine-grained) só com escopo `read:packages` e
autentique uma vez no servidor:

```bash
echo "<TOKEN>" | docker login ghcr.io -u <seu-usuario-github> --password-stdin
```

Isso fica salvo em `~/.docker/config.json` do usuário `deploy` — não precisa
repetir a cada deploy.

### 7. Secrets do GitHub Actions

Em Settings → Secrets and variables → Actions, do repositório, crie:

- `VPS_HOST` — IP ou hostname do VPS.
- `VPS_USER` — `deploy` (o usuário criado no passo 1, com Docker acessível sem
  `sudo`).
- `VPS_SSH_KEY` — a **chave privada** de um par gerado só para isto:

  ```bash
  ssh-keygen -t ed25519 -f deploy_key -C "github-actions-bodycreator" -N ""
  ```

  A chave pública (`deploy_key.pub`) vai para
  `/home/deploy/.ssh/authorized_keys` no VPS; o conteúdo de `deploy_key`
  (privada, sem senha) vira o valor do secret `VPS_SSH_KEY`. Não reaproveite sua
  própria chave pessoal de SSH para isto.

`deploy.yml` também usa `secrets.GITHUB_TOKEN` (automático, não precisa criar) para
autenticar no GHCR ao publicar as imagens.

### 8. Primeiro deploy

Com o DNS já resolvendo para o VPS e os secrets configurados, um `git push` na
`main` (ou "Run workflow" manual em `deploy.yml`) já é suficiente: o workflow
constrói a imagem da API, publica no GHCR, copia `docker-compose.yml`/`Caddyfile`
atualizados para o servidor e roda `pull` → migração → `up -d` lá.

Se preferir validar manualmente antes de depender do Actions, rode direto no
servidor (mesma sequência que o workflow automatiza):

```bash
cd /opt/bodycreator
docker compose pull
docker compose run --rm api node dist/db/migrate.js
docker compose up -d
```

### 9. Criar o primeiro usuário admin

O seeder é idempotente: se o e-mail já existe, ele não mexe na senha — então é
seguro rodar mais de uma vez sem risco de "resetar" um admin sem querer.

```bash
cd /opt/bodycreator
docker compose run --rm \
  -e ADMIN_SEED_EMAIL="admin@seudominio.com.br" \
  -e ADMIN_SEED_PASSWORD="uma-senha-forte-de-verdade-aqui" \
  api node dist/seed-admin.js
```

A senha só existe nesse comando, digitada na hora — não fica em nenhum arquivo.
Depois do primeiro login, o próprio app força a troca de senha
(`mustChangePassword`).

---

## Operação do dia a dia

### Deploy contínuo

Todo push na `main` dispara `deploy.yml`: build + push da imagem da API no GHCR
(tags `:latest` e `:<sha do commit>`), sincronização de `docker-compose.yml` e
`Caddyfile` com o servidor, depois `pull` → migração → `up -d` → `restart caddy`
(para o Caddy sempre reler o `Caddyfile`, caso ele tenha mudado) → `docker image
prune -f`. Se a migração falhar, o script para ali (`set -e`) e a API antiga
continua no ar — a versão nova nunca fica exposta com um esquema incompatível.

### Rollback

A imagem também é publicada com a tag do commit (`ghcr.io/<repo>/api:<sha>`).
Para voltar a uma versão anterior:

```bash
# em /opt/bodycreator/.env, fixe o commit desejado:
# TAG=<sha-do-commit-anterior>
cd /opt/bodycreator
docker compose pull
docker compose up -d
```

Se o rollback precisar desfazer uma migração de banco, isso é manual — Drizzle não
gera migração reversa automática. Confirme se a versão anterior do schema é
compatível antes de assumir que só trocar a tag basta.

### Logs e diagnóstico

```bash
cd /opt/bodycreator
docker compose ps                 # estado de cada container
docker compose logs -f api        # logs da API em tempo real
docker compose logs -f caddy      # logs do proxy/TLS
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"   # acesso ao banco
curl -s https://<domínio-da-api>/health   # healthcheck público
```

---

## Backup e restauração

Dois scripts em `infra/`, pensados para rodar só no VPS (Linux/Ubuntu) via cron:

- **`infra/backup.sh`** — todo dia, faz `pg_dump` do Postgres de produção, comprime,
  sobe para `backups/` no bucket do R2 e apaga do R2 backups com mais de 30 dias.
  Aborta (`exit 1`) se o dump sair com menos de 1 KB — um dump vazio ou truncado é
  falha silenciosa, e é melhor descobrir isso no log do cron do dia do que na hora
  de precisar restaurar de verdade.
- **`infra/restore-check.sh`** — uma vez por mês, baixa o backup mais recente do R2,
  restaura num container Postgres **descartável** (isolado, nunca toca no banco de
  produção) e verifica **duas** coisas: que o esquema restaurado tem pelo menos 7
  tabelas e que a tabela `users` tem pelo menos 1 registro. As duas checagens são
  deliberadas — um dump que restaura o esquema mas perdeu os dados passaria numa
  checagem que só olha tabelas. O container é sempre removido ao final (`trap` no
  `EXIT`), inclusive quando a verificação falha, para o run do mês seguinte não
  colidir com um container de nome igual ainda vivo.

Um backup que roda mas nunca foi restaurado com sucesso nem uma vez não é um
backup, é uma esperança. `restore-check.sh` é o que transforma essa esperança em
fato verificado, todo mês, automaticamente.

### Instalar o AWS CLI no VPS

Os dois scripts usam `aws s3` para falar com o R2 (compatível com a API S3). O AWS
CLI **não é dependência do repositório** — é dependência de operação do VPS, então
não entra em nenhum `Dockerfile` nem `package.json`; instala-se uma vez no servidor:

```bash
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
# em VPS arm64, troque x86_64 por aarch64 na URL acima
unzip awscliv2.zip
sudo ./aws/install
aws --version
rm -rf awscliv2.zip aws/
```

Não é preciso rodar `aws configure`: os dois scripts exportam
`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` a partir de `R2_ACCESS_KEY_ID`/
`R2_SECRET_ACCESS_KEY`, que já estão no `.env` de produção (Task 10) — não faz
sentido manter a mesma credencial duplicada num `~/.aws/credentials` à parte, que
ninguém lembraria de atualizar junto numa rotação de chave.

(Optou-se por AWS CLI em vez de `rclone`: o R2 é compatível com a API S3 e os
comandos `aws s3 cp/ls/rm` já são os documentados oficialmente pela Cloudflare para
esse cenário; usar `rclone` introduziria uma segunda ferramenta com seu próprio
formato de configuração para o mesmo trabalho que o `aws s3` já resolve.)

### Agendar

```bash
sudo chmod +x /opt/bodycreator/infra/backup.sh /opt/bodycreator/infra/restore-check.sh
sudo crontab -e
```

```cron
15 4 * * *  /opt/bodycreator/infra/backup.sh        >> /var/log/bodycreator-backup.log 2>&1
30 5 1 * *  /opt/bodycreator/infra/restore-check.sh >> /var/log/bodycreator-restore.log 2>&1
```

Backup todo dia às 4h15 UTC; verificação de restauração no dia 1 de cada mês às
5h30 UTC (depois do backup do dia ter concluído).

**Nota sobre PATH do cron**: o cron do root tem um `PATH` mínimo e pode não
encontrar `docker` ou `aws` instalados em locais não-padrão. Se o log do cron
mostrar "command not found", defina o `PATH` correto no topo do crontab:

```bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 4 * * *  /opt/bodycreator/infra/backup.sh        >> /var/log/bodycreator-backup.log 2>&1
```

### Rodar os dois pela primeira vez, à mão

Depois de agendar, rode os dois manualmente uma vez — um plano que só agenda o
backup e nunca o roda entrega uma promessa não verificada:

```bash
/opt/bodycreator/infra/backup.sh
/opt/bodycreator/infra/restore-check.sh
```

Saída esperada: `Backup concluído: bodycreator-…` e `OK: restauração verificada —
7 tabelas, N usuários.` Qualquer outra saída (ou código de saída diferente de 0) é
falha — confira `docker compose logs`, credenciais do R2 no `.env` e se o AWS CLI
está instalado.

### Restauração manual (desastre real, no banco de produção)

Diferente do `restore-check.sh` (que só valida num container descartável), isto
**restaura de fato** o banco de produção. **Destrutivo** — apaga o conteúdo atual
antes de restaurar. Confirme que tem o arquivo certo antes de rodar.

O dump é gerado com `--no-owner --no-privileges` (ver `infra/backup.sh`) para não
depender da role de produção existir tal qual no destino — portanto, restaurações
em ambientes novos (VPS reconstruído, container de verificação) funcionam sem erros
de permissão mascarando a restauração real.

```bash
cd /opt/bodycreator
source .env
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto

# 1. Baixa o backup desejado do R2 (troque pelo nome do arquivo certo —
#    `aws s3 ls` lista o que existe em backups/)
aws s3 cp "s3://${R2_BUCKET}/backups/bodycreator-AAAAMMDDTHHMMSSZ.sql.gz" /tmp/restore.sql.gz \
  --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# 2. Para a API para não escrever durante a restauração
docker compose stop api

# 3. Limpa o schema atual
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 4. Restaura o dump
# -v ON_ERROR_STOP=1: essencial para abortar se o dump estiver corrompido
# ou o schema for incompatível — sem isso, psql silencia erros, sai com código 0,
# e o operador fica achando que restaurou quando na verdade falhou.
gunzip -c /tmp/restore.sql.gz | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# 5. Sobe a API de novo
docker compose start api
rm -f /tmp/restore.sql.gz
```

Se o backup for de uma versão do schema anterior à atual, rode a migração
(`docker compose run --rm api node dist/db/migrate.js`) depois do passo 4, antes
do passo 5.

### Recuperação de desastre: VPS morto → VPS novo

Cenário: o VPS de produção sumiu (disco corrompido, provedor perdeu a instância,
etc.) e é preciso reconstruir tudo num servidor novo, sem perder dados além do que
ficou de fora do backup do dia.

1. Siga a seção **"Provisionamento do zero"** deste documento, do passo 1 ao passo
   8 — isso deixa um VPS novo com Docker, `/opt/bodycreator`, `.env` preenchido
   (**as mesmas credenciais de R2 do servidor antigo** — elas não se perdem junto
   com o VPS, moram no provedor de object storage) e a API no ar com um
   banco **vazio**.
2. Instale o AWS CLI no servidor novo (seção acima).
3. Restaure o backup mais recente do R2 seguindo **"Restauração manual"** acima —
   os passos 2 a 5 (a API já vai estar rodando do passo 1, então o passo "para a
   API" se aplica normalmente).
4. Rode `restore-check.sh` uma vez à mão para confirmar, de forma independente da
   restauração que acabou de fazer, que o banco novo tem o formato esperado.
5. Confirme login na aba **Gerenciar** do app com um usuário que existia antes do desastre — é a
   prova final de que os dados voltaram, não só o esquema.
6. Reagende o cron (seção "Agendar" acima) no servidor novo — ele não veio junto
   na reconstrução do zero.

Perda de dados nesse cenário fica limitada ao intervalo entre o último backup
diário (4h15 UTC) e o momento do desastre — na pior hipótese, até 24h de dados.
Reduzir essa janela (backups mais frequentes, WAL archiving contínuo) fica como
melhoria futura; fora do escopo deste task.

---

## Monitor de uptime externo (pendência)

**Não cadastrado neste task** — exige criar conta num serviço de terceiro, decisão
que cabe ao dono do projeto, não a esta implementação.

Um monitor rodando dentro do próprio VPS não serve pra nada nesse cenário: se o VPS
inteiro cair, o monitor cai junto e não avisa ninguém. É preciso um serviço externo,
rodando fora da infraestrutura que ele está observando.

**O que precisa ser feito** (por quem tiver acesso à conta do projeto):

1. Criar conta num serviço gratuito de monitoramento externo (ex.: UptimeRobot,
   Better Uptime, Freshping).
2. Cadastrar um monitor HTTP(S) apontando para `https://<domínio-da-api>/health`,
   esperando `200` com corpo `{"status":"ok"}`.
3. Configurar alerta por e-mail (ou outro canal) para quando o monitor detectar
   indisponibilidade.
4. Disparar um teste manual (a maioria desses serviços tem um botão "test alert")
   e confirmar que o e-mail chega.

---

## Checklist de reconstrução do zero

Resumo dos passos acima, na ordem, para reconstruir o ambiente inteiro num VPS
novo:

1. Provisionar o VPS, criar o usuário `deploy` com sudo.
2. Endurecer (SSH só por chave, firewall, atualizações automáticas).
3. Instalar Docker Engine + plugin Compose; colocar `deploy` no grupo `docker`.
4. Apontar o DNS do domínio/subdomínio para o IP do VPS.
5. Criar `/opt/bodycreator`; copiar `docker-compose.yml` e `Caddyfile` de
   `infra/` para lá.
6. Criar `/opt/bodycreator/.env` a partir de `infra/.env.example`, preenchido com
   segredos reais (`chmod 600`).
7. Se as imagens forem privadas, `docker login ghcr.io` no servidor.
8. Gerar um par de chaves SSH dedicado ao deploy; chave pública no
   `authorized_keys` do `deploy`; chave privada como secret `VPS_SSH_KEY` no
   GitHub, junto com `VPS_HOST` e `VPS_USER`.
9. Push na `main` (ou "Run workflow" manual) dispara o primeiro deploy.
10. Rodar o seeder do admin (`docker compose run --rm -e ADMIN_SEED_EMAIL=...
    -e ADMIN_SEED_PASSWORD=... api node dist/seed-admin.js`).
11. Cadastrar o monitor de uptime externo (seção acima) — pendência para o dono
    do projeto.
12. Agendar `infra/backup.sh` e `infra/restore-check.sh` no cron (seção "Backup e
    restauração" acima) e rodar os dois uma vez à mão.

Este checklist parte de um banco **vazio** (VPS novo, sem dados anteriores). Se o
objetivo é recuperar um VPS que caiu **com** dados que precisam voltar, siga
"Recuperação de desastre: VPS morto → VPS novo" na seção "Backup e restauração"
em vez deste checklist genérico — ele reaproveita os passos 1 a 9 daqui e insere a
restauração do backup antes de considerar o ambiente pronto.
