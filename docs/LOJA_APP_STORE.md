# Loja e compras — Body Creator

## Modelo adotado

- Cada pacote pago é uma compra **não consumível**: paga uma vez e não expira.
- O preço e a moeda vêm do App Store Connect; nunca ficam gravados no banco ou
  no manifesto.
- O cliente não cria conta no Body Creator. O StoreKit restaura os direitos pela
  Conta Apple usada na App Store.
- O app valida a transação localmente pelo StoreKit 2 e envia o JWS assinado para
  a API. A API verifica a assinatura com a biblioteca oficial da Apple e emite um
  token temporário para baixar os PNGs daquele pacote.
- O R2 precisa ficar privado. A API entrega as capas, os pacotes grátis e os
  arquivos pagos autorizados.

Referências oficiais: [compras não consumíveis](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/create-consumable-or-non-consumable-in-app-purchases),
[StoreKit 2](https://developer.apple.com/storekit/),
[biblioteca da Apple para validação no servidor](https://developer.apple.com/documentation/appstoreserverapi/simplifying-your-implementation-by-using-the-app-store-server-library)
e [diretriz 3.1.1](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase).

## Cadastrar um pacote real

1. Em App Store Connect, abra o Body Creator e confirme que contratos, dados
   bancários e fiscais para apps pagos estão ativos.
2. Vá a **Monetização → Compras dentro do app** e crie um produto
   **Não consumível**.
3. Escolha um Product ID definitivo, por exemplo
   `com.daige.bodycreator.pack.harmonizacao-facial`. Ele precisa ser único e deve
   ser tratado como imutável depois da primeira venda.
4. Cadastre nome, descrição, localização pt-BR, disponibilidade e preço. Adicione
   também a captura de tela pedida para revisão da compra.
5. No Body Creator, entre com `felipedaige@gmail.com`, abra
   **Configurações → Pacotes e figurinhas → pacote → Editar informações**,
   desligue **Pacote gratuito** e cole exatamente o mesmo Product ID.
6. Publique o pacote e depois publique o catálogo. O app buscará o preço
   localizado diretamente da App Store.

Um pacote sem Product ID não pode ser marcado como pago. O servidor também não
permite reutilizar o mesmo ID em dois pacotes nem trocar o ID depois que já existe
uma transação registrada.

## Configuração da API de produção

No `.env` do VPS:

```dotenv
APP_BUNDLE_ID=com.daige.bodycreator
APP_APPLE_ID=1234567890
```

`APP_APPLE_ID` é o número em **App Store Connect → Informações do app → ID Apple**,
não o Bundle ID e não o Product ID. Depois de atualizar o `.env`, recrie o
container da API. As raízes públicas G2/G3 da Apple já estão versionadas no
servidor; não existe chave privada da Apple no projeto.

## Testar sem cobrança no Xcode

O esquema `Figurinhas` já usa `Store/BodyCreator.storekit` na ação **Run**. Esse
arquivo contém o produto de demonstração
`com.daige.bodycreator.pack.premium-exemplo`, ligado ao pacote premium do catálogo
embutido.

1. Deixe a API local e o Postgres de desenvolvimento no ar.
2. Rode as migrações e abra o projeto gerado:

   ```bash
   cd server
   set -a
   source .env
   set +a
   npm run db:migrate
   cd ..
   xcodegen generate
   open Figurinhas.xcodeproj
   ```

3. Execute o app pelo esquema `Figurinhas`, abra **Loja** e compre o pacote de
   demonstração. A folha é do ambiente local do StoreKit e não cobra nada.
4. Use **Debug → StoreKit → Manage Transactions** no Xcode para apagar, reembolsar
   ou inspecionar a transação e repetir os cenários.
5. Toque em **Restaurar compras** para testar a restauração.

Transações locais têm ambiente `Xcode` e não são assinadas pela Apple. A API só
aceita esse formato sem verificação criptográfica quando `NODE_ENV=development`;
produção e testes automatizados não possuem essa exceção.

Ao usar **Run** pelo Xcode, o scheme aponta `BODYCREATOR_API_URL` para
`http://MacBook-Pro-de-Felipe.local:3000`. Assim o simulador e o iPhone físico
na mesma rede alcançam a API deste Mac. Se o nome local do Mac mudar, atualize
essa variável em `project.yml` e rode `xcodegen generate` novamente. Archives de
produção não recebem essa variável e continuam usando o `API_BASE_URL` de
Release.

Para testar o Sandbox real, mude temporariamente **Run → Options → StoreKit
Configuration** para `None`, use produtos já criados no App Store Connect e uma
conta Sandbox. Reative `BodyCreator.storekit` para desenvolvimento local.

## Antes da App Review

- Crie no App Store Connect todos os Product IDs publicados no catálogo.
- Envie a primeira compra dentro do app junto da versão que apresenta a Loja.
- Confirme em iPhone físico: compra, cancelamento, compra pendente, restauração,
  reinstalação e download com a API/R2 de produção.
- Deixe os produtos visíveis e funcionais para o revisor e descreva a Loja nas
  notas de revisão.
- Como a área proprietária exige login, forneça uma conta demo ao revisor. Diga
  que clientes comuns não fazem login e que as compras são restauradas pelo
  botão **Loja → Restaurar compras**.
- Atualize as respostas de privacidade para refletir os identificadores de
  compra que a API recebe para entregar o conteúdo. Declare **Histórico de
  compras**, não vinculado à identidade e usado somente para funcionalidade do
  app; os dados não são usados para rastreamento.
