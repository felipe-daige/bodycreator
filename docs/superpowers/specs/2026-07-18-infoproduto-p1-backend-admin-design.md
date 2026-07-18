# Body Creator como infoproduto — P1: Backend e Painel Admin

**Data:** 2026-07-18
**Status:** Aprovado em brainstorm, aguardando revisão do spec
**Escopo deste documento:** sub-projeto P1. Os sub-projetos P2–P4 aparecem só como contexto.

> **Decisão posterior:** a escolha do proprietário passou a ser administração
> exclusivamente nativa no app. A API e o modelo de permissões deste documento
> permanecem; as seções sobre painel React foram substituídas por
> `2026-07-18-native-administration-remote-catalog-design.md`.

## 1. Contexto

O MVP do Body Creator (branch `figurinhas-mvp`) é um app offline: conteúdo compilado no binário, sem contas, sem rede, rótulo de privacidade "Dados Não Coletados". O motor figurinha → Instagram está pronto e testado.

A evolução pedida — contas com papéis, importação de figurinhas pelo admin, loja, aba Explorar — não cabe nesse formato. Cada um desses itens exige servidor. Isto não é uma extensão do MVP; é um produto novo que reaproveita o motor do MVP como um módulo.

O módulo **Catalog** foi desenhado no MVP exatamente para esta troca (bundle → servidor atrás da mesma interface), então a migração acontece dentro dele e a UI não muda de forma.

### Decisões de negócio tomadas no brainstorm

| Tema | Decisão |
|---|---|
| Pagamento | **IAP agora, checkout externo depois.** A arquitetura de entitlements já nasce preparada para plugar link externo quando as regras brasileiras pós-CADE estiverem assentadas. |
| Entrega de conteúdo | **Servidor com download sob demanda.** Pacote novo entra no ar sem passar pela App Review. |
| Papéis | **Permissões granulares concedidas pelo admin**, não papéis rígidos. |
| Divisão de receita | **Fora da v1.** Cada pacote carrega campo de autoria desde o início para que o modelo de marketplace caiba depois sem migração. |
| Unidade de venda | **Pacote.** Figurinha avulsa via IAP significa um produto no App Store Connect por figurinha — inviável operacionalmente. "Conjunto" vira combo de pacotes. |
| Aba Explorar | **Vitrine curada + faixa de exemplos de uso**, publicados pelo admin. Sem conteúdo de usuário, portanto sem obrigação de moderação (diretriz 1.2 da Apple). |
| Infraestrutura | **VPS próprio** em São Paulo, com os PNGs no Cloudflare R2. |
| Stack do backend | **TypeScript** (Fastify + React). |

### A simplificação central: o cliente final não tem conta

Com StoreKit 2, a compra é uma transação assinada criptograficamente pela Apple. O app envia essa assinatura ao servidor, que a valida contra os certificados da Apple e libera o download.

Consequência: **o profissional que compra não precisa de cadastro, senha nem login.** A identidade dele é o Apple ID, e trocar de aparelho já restaura tudo pelo mecanismo nativo da Apple.

Isso elimina de uma vez: telas de login e recuperação de senha, exclusão de conta obrigatória (diretriz 5.1.1(v)), Sign in with Apple obrigatório, e boa parte da exposição à LGPD. Contas existem **apenas para admin e gerentes**, e apenas no painel web.

### Decomposição

| | Sub-projeto | Entrega |
|---|---|---|
| **P1** | Backend + painel web | Este documento. |
| **P2** | App lê catálogo remoto | Catalog troca bundle → servidor, download sob demanda, cache offline. Tudo liberado, sem cobrança. |
| **P3** | Monetização | Produtos no App Store Connect, StoreKit 2, validação no servidor, restaurar compras, aba Loja. |
| **P4** | Explorar | Vitrine, coleções, faixa "Veja em uso". |

P1 vem primeiro porque nada existe sem conteúdo no ar. P2 vem antes de P3 para separar "a entrega funciona" de "a cobrança funciona": quando as duas sobem juntas, toda falha vira investigação.

### Por que o painel é web e não uma aba do app

Três razões independentes, cada uma suficiente:

1. As artes nascem no desktop (Illustrator/Photoshop). Importar PNG pelo iPhone é um fluxo ruim para quem produz.
2. Código administrativo embarcado vai para o aparelho de todos os usuários — superfície de ataque desnecessária.
3. A App Review costuma rejeitar ou exigir credenciais para funcionalidade administrativa oculta no app.

## 2. Escopo do P1

**Entrega:** backend e painel web operando em produção, com catálogo publicável.

**Não entrega:** nenhuma alteração no app iOS, nada de preço ou IAP, nada da aba Explorar.

**Critério de pronto:** um gerente convidado por e-mail consegue entrar, subir figurinhas, montar um pacote e — se tiver a permissão — publicá-lo; o manifesto resultante fica disponível no R2 e o backup do banco foi restaurado com sucesso em teste.

## 3. Arquitetura

### Topologia

```
                        Cloudflare (CDN + TLS)
                          │                  │
                          ▼                  ▼
                    R2 (PNGs +          VPS São Paulo
                    manifestos)         ┌──────────────────┐
                          ▲             │ Caddy   (TLS)    │
                          │             │ API     (Fastify)│
                          └─────────────│ Postgres 16      │
                            URLs        │ Painel  (React)  │
                            assinadas   └──────────────────┘
```

Quatro serviços em Docker Compose. Caddy termina TLS (certificado automático e renovação sozinha), serve o painel React como estático e faz proxy para a API.

### Por que os PNGs não ficam no VPS

Os arquivos vivem no R2, atrás do CDN da Cloudflare, e o VPS apenas emite URLs assinadas. Ganhos:

- A entrega de figurinha **não depende do VPS estar de pé**.
- O download sai de um ponto de presença brasileiro.
- O R2 não cobra tráfego de saída.
- **O VPS vira quase descartável**: se ele morrer, sobe-se outro e restaura-se o dump. O conteúdo nunca esteve lá.

### Deploy

GitHub Actions constrói as imagens, envia por SSH e roda `docker compose up -d`. Nenhuma edição manual de arquivo no servidor — o estado do servidor precisa ser reproduzível a partir do repositório.

Segredos moram em `.env` no servidor, fora do git. É onde a senha do seeder do admin vive.

## 4. Modelo de dados

### `users`

`id`, `email` (único), `name`, `password_hash`, `role` (`admin` | `gerente`), `permissions` (array), `status` (`invited` | `active` | `disabled`), `must_change_password`, `created_at`, `last_login_at`.

Desativar em vez de apagar: apagar usuário quebraria o histórico do `audit_log`.

### `invites`

`id`, `email`, `token_hash`, `role`, `permissions`, `invited_by`, `expires_at`, `accepted_at`.

O token só existe em claro no e-mail enviado. O banco guarda apenas o hash — vazamento do banco não permite aceitar convite pendente.

### `packs`

`id`, `slug` (único), `name`, `description`, `cover_key`, `author_name`, `status` (`draft` | `published` | `archived`), `sort_order`, `created_by`, `published_at`.

`author_name` é o gancho para o modelo de marketplace no futuro. Preço **não** aparece aqui — pertence ao P3.

### `categories`

`id`, `pack_id`, `name`, `sort_order`.

### `stickers`

`id` (**único globalmente**), `pack_id`, `category_id`, `name`, `tags`, `file_key`, `width`, `height`, `bytes`, `checksum`, `sort_order`.

> **Invariante herdada do MVP:** o `id` da figurinha é único no sistema inteiro, não por pacote, porque os favoritos no app são gravados como id puro (`Favorites/FavoritesStore.swift`). O banco impõe isso com constraint de unicidade — invariante de dados não se mantém por convenção.

### `catalog_versions`

`version` (inteiro crescente), `manifest_key`, `published_by`, `published_at`, `checksum`.

### `audit_log`

`id`, `actor_id`, `action`, `entity_type`, `entity_id`, `payload`, `created_at`.

A partir do momento em que mais de uma pessoa mexe no catálogo, "quem despublicou o pacote?" deixa de ser pergunta hipotética.

## 5. Permissões

Papéis rígidos não atendem ao pedido ("depende do que o admin permitir o gerente fazer"). O modelo é: `role` define o piso, a lista de permissões define o resto.

| Permissão | Concede |
|---|---|
| `sticker.import` | Subir figurinhas |
| `pack.create` | Criar pacote |
| `pack.edit` | Editar pacote existente |
| `pack.publish` | Publicar e despublicar |
| `pack.price` | Definir preço (inerte no P1, usado no P3) |
| `report.view` | Ver faturamento (inerte no P1) |
| `user.manage` | Convidar e gerenciar usuários |

`admin` tem todas implicitamente. `gerente` tem apenas as concedidas, com uma exceção explícita: **`user.manage` não pode ser concedida a um gerente.** Quem convida define permissões, e permitir que um gerente conceda permissões a outros tornaria o teto de privilégio impossível de raciocinar. Só admin gerencia gente.

A separação que mais importa é **`pack.edit` de `pack.publish`**: montar o pacote inteiro e colocá-lo no ar são decisões de peso diferente, e quem cria nem sempre deve poder publicar sozinho.

`pack.price` e `report.view` existem no P1 sem efeito prático, para que o P3 não precise migrar permissões de usuários já cadastrados.

A checagem é feita no servidor, em middleware, nunca só na interface. Botão escondido no React não é controle de acesso.

## 6. Autenticação

**Sem cadastro público.** A única entrada é convite.

Fluxo: admin com `user.manage` convida por e-mail e marca as permissões → a pessoa recebe link com token de 32 bytes aleatórios → define a própria senha → conta vira `active`.

- Senhas com **Argon2id**.
- Sessão em cookie `httpOnly`, `SameSite=Lax`, `Secure` — não JWT em `localStorage`, que é legível por qualquer script injetado.
- Rate limit no login, por IP e por conta.
- CORS restrito ao domínio do painel.

### Envio de e-mail

O convite depende de entrega confiável de e-mail, o que descarta SMTP direto do VPS: IP novo de VPS cai em spam por padrão e não vale a pena administrar reputação de remetente. Usa-se um serviço transacional (Resend, Postmark ou SES) com domínio próprio verificado por SPF/DKIM.

É o único componente do P1 com dependência externa paga, e a falha dele é visível: convite que não chega trava o cadastro. O envio registra sucesso/erro no `audit_log`, e o painel permite reenviar convite pendente.

### Seeder do admin

Idempotente: roda quantas vezes for preciso sem duplicar o usuário nem sobrescrever a senha de um admin já ativo.

- Lê a senha inicial de `ADMIN_SEED_PASSWORD`. **Nenhuma credencial no código ou no git.**
- Grava apenas o hash.
- Marca `must_change_password`, de modo que a senha inicial não sobreviva ao primeiro acesso.

## 7. Upload e validação de figurinha

As regras já existem, testadas, em `Scripts/validate_content.py`, e migram para a API rodando no momento do upload:

- PNG válido
- Possui canal alfa
- Até 2 MB
- Maior lado entre 512 e 2048 px
- `id` inédito no sistema

Rejeição devolve mensagem em pt-BR dizendo qual regra falhou.

> **O servidor valida os bytes mas nunca reencoda o PNG.** Reencodar pode descartar o canal alfa, e a transparência é o produto inteiro (ver `CLAUDE.md`, seção de integração com o Instagram). Os bytes originais vão para o R2 intactos, e o `checksum` registrado permite provar isso depois.

## 8. Publicação

Publicar gera o JSON do catálogo publicado e o envia ao R2 como `catalog/v{N}.json`, **imutável**. Um ponteiro separado indica a versão corrente.

Três consequências, todas desejáveis:

- **Rollback é apontar para a versão anterior**, não desfazer edições.
- Manifesto imutável tem cache eterno no CDN.
- Editar um pacote nunca altera um manifesto já publicado — só gera o próximo.

O formato do manifesto mantém compatibilidade com o `Content/manifest.json` do MVP, de modo que o P2 troque a fonte sem reescrever os modelos do módulo Catalog.

## 9. Operação

O que se assume ao escolher VPS em vez de serviço gerenciado, e que portanto entra no escopo:

- **Backup diário** do Postgres para o R2, retenção de 30 dias.
- **Job mensal de restauração**: baixa o dump mais recente, restaura num container descartável e verifica se o banco abre e tem as tabelas esperadas. Backup nunca restaurado não é backup — e é a peça que mais falta em projeto de VPS.
- `ufw` fechado, SSH somente por chave, `unattended-upgrades` ligado.
- Endpoint de health e monitor externo de uptime.
- Logs estruturados em JSON.

## 10. Testes

**Unitários:** avaliação de permissões, validação de PNG (incluindo os casos ruins — sem alfa, grande demais, dimensão fora da faixa, PNG truncado), geração de manifesto.

**Integração**, com Postgres em container, cobrindo o caminho completo: convite → aceite → login → upload → montar pacote → publicar → manifesto disponível.

**Testes de permissão negada** são obrigatórios: para cada rota protegida, um teste que confirma que o usuário *sem* a permissão recebe 403. Controle de acesso sem teste do caminho negativo é controle de acesso não testado.

**Restauração de backup**, que é o que separa "tenho backup" de "consigo voltar".

## 11. Riscos

| Risco | Tratamento |
|---|---|
| VPS cai | PNGs no R2 seguem servindo; o app (P2) degrada para o cache local. Monitor externo avisa. |
| Perda do banco | Backup diário fora do VPS, com restauração verificada mensalmente. |
| Pirataria do conteúdo | **Estrutural e não resolvível**: o produto é um PNG que vai para a área de transferência. Quem compra pode repassar. A resposta é volume, atualização constante e comunidade — não DRM. |
| Senha inicial do admin exposta | Foi digitada em conversa e deve ser considerada comprometida; usar outra no seed, com troca obrigatória no primeiro acesso. |
| Regras da Apple mudarem (checkout externo) | Entitlement fica atrás de uma interface própria; trocar a origem da compra não toca no resto. |

## 12. Fora de escopo

Preço e IAP (P3). Qualquer alteração no app iOS (P2). Aba Explorar (P4). Divisão de receita, repasse e relatório por criador. Cadastro público de usuários. Conteúdo publicado por usuários — e, com ele, toda a obrigação de moderação da diretriz 1.2.
