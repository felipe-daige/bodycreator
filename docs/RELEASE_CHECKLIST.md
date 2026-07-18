# Checklist de release — Body Creator

## Antes de todo envio à App Store

- [ ] Executar `python3 Scripts/validate_content.py Content` e confirmar o resultado `OK`.
- [ ] Executar todos os testes do scheme `Figurinhas` em um simulador iOS.
- [ ] Fazer uma compilação `Release` e validar o archive no Organizer do Xcode.
- [ ] Confirmar que `InstagramSharing.facebookAppID` está preenchido (a API oficial de Stories exige; sem ele o Instagram recusa o compartilhamento).
- [ ] Testar em um iPhone real com o Instagram atualizado:
  - [ ] “Usar no Instagram” oferece “Tirar foto agora” e “Escolher da galeria”.
  - [ ] Pela câmera: o app pede permissão na primeira vez e, após a captura, o Instagram abre com a foto de fundo e a figurinha por cima.
  - [ ] Pela galeria: mesmo resultado.
  - [ ] A figurinha entra com transparência preservada e é arrastável.
- [ ] Confirmar que “Só copiar a figurinha” permite colar em outro app (ex.: WhatsApp).
- [ ] Confirmar que favoritos persistem após encerrar e reabrir o app.
- [ ] Na aba **Configurações**, confirmar a experiência comum sem linguagem de
      administração, papéis ou permissões.
- [ ] Entrar com `felipedaige@gmail.com`, confirmar a troca de senha obrigatória e
      verificar que “Pacotes e figurinhas” aparece somente para essa conta.
- [ ] Confirmar criação de pacote e upload pelo app Arquivos.
- [ ] Publicar o catálogo no app, puxar para atualizar a aba Pacotes e confirmar que
      o novo conteúdo continua disponível depois de ficar offline.
- [ ] Confirmar que “Excluir minha conta” anonimiza a conta e encerra a sessão.
- [ ] Reinstalar o app e confirmar que o onboarding aparece apenas na primeira abertura.
- [ ] Conferir todos os textos visíveis em pt-BR e testar com tamanho de fonte maior.

## Antes do primeiro envio

- [ ] Substituir `Content/packs/exemplo` pelas artes finais e rodar o validador.
- [ ] Substituir o ícone provisório em `App/Assets.xcassets/AppIcon.appiconset/AppIcon.png` pela identidade final (1024×1024, sem alfa).
- [ ] Criar um app em https://developers.facebook.com/apps, copiar o número do App ID e preencher `InstagramSharing.facebookAppID` (Export/InstagramSharing.swift).
- [ ] Confirmar disponibilidade do nome “Body Creator” no App Store Connect.
- [ ] Confirmar o bundle id `com.daige.bodycreator` e selecionar a equipe da conta Apple Developer.
- [ ] Trocar `API_BASE_URL` de Release em `project.yml` pelo domínio real da API.
- [ ] Preencher a ficha de privacidade com nome, e-mail e identificador de usuário,
      vinculados à conta e usados somente para funcionalidade administrativa; sem rastreamento.
- [ ] Fornecer à App Review a conta proprietária demo e instruções para chegar à
      aba **Configurações** e entrar na conta.
- [ ] Publicar política de privacidade e URL de suporte incluindo armazenamento dos
      dados da conta e exclusão dentro do app.
- [ ] Preparar screenshots exigidas para os tamanhos de iPhone aceitos pelo App Store Connect.
- [ ] Preparar subtítulo, descrição, palavras-chave, URL de suporte e política de privacidade em pt-BR.
- [ ] Definir classificação etária, categoria e direitos autorais das artes.
