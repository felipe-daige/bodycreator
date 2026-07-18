# Checklist de release — Body Creator

## Antes de todo envio à App Store

- [ ] Executar `python3 Scripts/validate_content.py Content` e confirmar o resultado `OK`.
- [ ] Executar todos os testes do scheme `Figurinhas` em um simulador iOS.
- [ ] Fazer uma compilação `Release` e validar o archive no Organizer do Xcode.
- [ ] Confirmar que `InstagramSharing.facebookAppID` está preenchido (a API oficial de Stories exige; sem ele o Instagram recusa o compartilhamento).
- [ ] Testar em um iPhone real com o Instagram atualizado:
  - [ ] “Usar no Instagram” abre o seletor de foto; ao escolher uma foto, o Instagram abre com a foto de fundo e a figurinha por cima, arrastável.
  - [ ] A figurinha entra com transparência preservada.
- [ ] Confirmar que “Só copiar a figurinha” permite colar em outro app (ex.: WhatsApp).
- [ ] Confirmar que favoritos persistem após encerrar e reabrir o app.
- [ ] Reinstalar o app e confirmar que o onboarding aparece apenas na primeira abertura.
- [ ] Conferir todos os textos visíveis em pt-BR e testar com tamanho de fonte maior.

## Antes do primeiro envio

- [ ] Substituir `Content/packs/exemplo` pelas artes finais e rodar o validador.
- [ ] Substituir o ícone provisório em `App/Assets.xcassets/AppIcon.appiconset/AppIcon.png` pela identidade final (1024×1024, sem alfa).
- [ ] Criar um app em https://developers.facebook.com/apps, copiar o número do App ID e preencher `InstagramSharing.facebookAppID` (Export/InstagramSharing.swift).
- [ ] Confirmar disponibilidade do nome “Body Creator” no App Store Connect.
- [ ] Confirmar o bundle id `com.daige.bodycreator` e selecionar a equipe da conta Apple Developer.
- [ ] Preencher a ficha de privacidade como “Dados não coletados”.
- [ ] Preparar screenshots exigidas para os tamanhos de iPhone aceitos pelo App Store Connect.
- [ ] Preparar subtítulo, descrição, palavras-chave, URL de suporte e política de privacidade em pt-BR.
- [ ] Definir classificação etária, categoria e direitos autorais das artes.
