# Operação — Body Creator (backend + painel) em produção

Este documento descreve como colocar o backend (`server/`) e o painel administrativo
(`admin/`) no ar num VPS, e como operar esse ambiente depois. Não contém nenhuma
credencial real — todo valor de exemplo abaixo é placeholder e precisa ser substituído.

## Arquitetura em produção

Um único VPS roda quatro containers via `infra/docker-compose.yml`:

- **`db`** — Postgres 16, dado persistido no volume `pgdata`.
- **`api`** — a API Fastify (`server/`), imagem `ghcr.io/<repo>/api`.
- **`admin`** — não fica no ar: só copia os arquivos estáticos do painel (já
  compilados na própria imagem) para o volume `admin_dist` e encerra. Ver nota no
  final desta seção.
- **`caddy`** — único ponto de entrada HTTP(S) público. Serve o painel (arquivos
  estáticos do volume `admin_dist`) e faz proxy reverso de `/api/*` para a `api`,
  tudo sob **o mesmo domínio**. TLS é automático (Let's Encrypt via Caddy).

Painel e API sob o mesmo domínio (API em `/api`) é uma decisão deliberada: mantém o
cookie de sessão same-site e evita toda a categoria de bug de cookie entre domínios.
**Não separe isso em dois domínios.**

### Por que o serviço `admin` não fica rodando

Ele copia os estáticos para o volume `admin_dist` e sai com código 0
(`restart: "no"`). O Caddy só sobe depois que o `admin` **termina com sucesso**
(`depends_on: admin: condition: service_completed_successfully`), então nunca serve
um `/srv` vazio na primeira subida. Em deploys seguintes, se a imagem do `admin`
mudou, o Compose recria só esse container; ele recopia os arquivos novos para o
mesmo volume, e o Caddy — que já está rodando e só lê do volume a cada request —
passa a servir a versão nova sem precisar reiniciar. Um `docker compose up -d`
repetido é seguro: se nada mudou, ele só reinicia um container já parado (a cópia
roda de novo, é idempotente).

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
- `PUBLIC_PANEL_ORIGIN` é a URL pública completa (`https://painel.seudominio...`),
  usada pela API para validar CORS.
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
constrói as duas imagens, publica no GHCR, copia `docker-compose.yml`/`Caddyfile`
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
Depois do primeiro login, o próprio painel força a troca de senha
(`mustChangePassword`).

---

## Operação do dia a dia

### Deploy contínuo

Todo push na `main` dispara `deploy.yml`: build + push das duas imagens no GHCR
(tags `:latest` e `:<sha do commit>`), sincronização de `docker-compose.yml` e
`Caddyfile` com o servidor, depois `pull` → migração → `up -d` → `restart caddy`
(para o Caddy sempre reler o `Caddyfile`, caso ele tenha mudado) → `docker image
prune -f`. Se a migração falhar, o script para ali (`set -e`) e a API antiga
continua no ar — a versão nova nunca fica exposta com um esquema incompatível.

### Rollback

Cada imagem também é publicada com a tag do commit (`ghcr.io/<repo>/api:<sha>`).
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
curl -s https://<domínio>/api/health   # healthcheck público
```

---

## Backup e restauração

### Backup

Dump lógico do Postgres, direto do container, para um arquivo no host:

```bash
cd /opt/bodycreator
source .env
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  > "backup-$(date +%F).sql"
```

Recomendado: agendar isto num `cron` do usuário `deploy` (`crontab -e`) e copiar o
arquivo resultante para fora do VPS (outro servidor, object storage) — um backup
que só existe no mesmo disco que pode falhar não protege contra perda do VPS.
Isso não está automatizado neste task; fica como melhoria futura.

### Restauração

**Destrutivo** — apaga o conteúdo atual do banco antes de restaurar. Confirme que
tem o arquivo de backup certo antes de rodar.

```bash
cd /opt/bodycreator
source .env

# 1. Para a API para não escrever durante a restauração
docker compose stop api

# 2. Limpa o schema atual
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 3. Restaura o dump
cat backup-AAAA-MM-DD.sql | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# 4. Sobe a API de novo
docker compose start api
```

Se o backup for de uma versão do schema anterior à atual, rode a migração
(`docker compose run --rm api node dist/db/migrate.js`) depois do passo 3, antes
do passo 4.

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
2. Cadastrar um monitor HTTP(S) apontando para `https://<domínio>/api/health`,
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
