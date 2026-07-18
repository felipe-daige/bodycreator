# Body Creator — administração nativa e catálogo remoto

**Data:** 2026-07-18
**Status:** decisão aprovada e implementada

## 1. Decisão de produto

Toda administração vive dentro do app iOS. O painel React deixa de fazer parte do
produto e do deploy. A API existente continua sendo a autoridade de autenticação
e dados; mover a interface não move segurança para o cliente.

O cliente que usa figurinhas continua sem cadastro. A aba **Configurações** é
desenhada para a experiência comum e não menciona administração, papel ou
permissões. Somente `felipedaige@gmail.com` enxerga, de forma contextual, a opção
de organizar pacotes e figurinhas.

Loja/IAP, preço efetivo, faturamento e Explorar não entram nesta entrega.

## 2. Experiência administrativa

- Configurações comuns com atualização do catálogo, conta e versão do app.
- Login por e-mail e senha dentro da tela Conta, com sessão em cookie
  `httpOnly` gerenciado por `URLSession`.
- Troca obrigatória da senha inicial antes de qualquer ação administrativa.
- Criação e edição de pacote, categorias, capa e figurinhas.
- Arquivos escolhidos no app Arquivos. O PNG passa ao multipart sem
  reencodificação; validação definitiva continua no servidor.
- Publicação em duas fases explicitadas na UI: publicar pacote e depois publicar
  uma nova versão do catálogo.
- Conta administrativa pode ser excluída no app. O backend remove dados pessoais
  e credenciais, mantendo um id anonimizado para não quebrar auditoria e autoria.

## 3. Catálogo remoto

`GET /catalog/current` é público e devolve o ponteiro de versão corrente. O app:

1. abre imediatamente com o último snapshot remoto válido ou, na primeira
   execução, com o conteúdo do bundle;
2. baixa o ponteiro e o manifesto versionado;
3. verifica SHA-256 antes de decodificar;
4. troca o catálogo em memória somente depois de todas as validações;
5. baixa capa/figurinha sob demanda e grava os bytes exatos em cache;
6. preserva snapshot e arquivos para uso offline.

Falha de rede, 404 antes da primeira publicação, JSON inválido ou checksum errado
nunca esvaziam conteúdo já disponível.

## 4. Segurança e privacidade

- O app não persiste senha/token em `UserDefaults`; o cookie assinado contém só o
  id e o servidor relê o usuário a cada requisição.
- O app compara o e-mail apenas para decidir a interface. Cada rota de gestão
  compara novamente com `OWNER_ADMIN_EMAIL`; papéis ou listas de permissões não
  concedem acesso a outro e-mail.
- Antes de ouvir conexões, a API promove a conta proprietária e limpa os
  privilégios de todas as outras contas existentes.
- Fotos de pacientes seguem apenas no aparelho/pasteboard e não são enviadas à
  API.
- Nome, e-mail e identificador das contas administrativas são dados vinculados,
  sem rastreamento, usados para funcionalidade do app. Privacy manifest, ficha do
  App Store Connect e política de privacidade devem refletir isso.

## 5. Distribuição e operação

O target registra o URL scheme `bodycreator`. Debug aponta a API para
`http://127.0.0.1:3000`; Release exige substituir o domínio de exemplo em
`project.yml` antes do archive.

Produção executa somente Postgres, Fastify e Caddy. Não existe imagem/volume do
painel web. A App Review recebe uma conta demo e instruções para Configurações.

## 6. Critérios de aceite

- Build iOS 16+ sem dependências externas.
- Teste de UI prova que Configurações é uma tela comum e teste local prova login
  real contra a API.
- Testes unitários cobrem cliente HTTP, multipart com bytes idênticos, deep link,
  leitura de PNG e cache/checksum do catálogo.
- Testes do servidor cobrem proprietário único, ponteiro público e
  exclusão/anônimização da conta.
- Suite anterior de Instagram/favoritos permanece verde.
