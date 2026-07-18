# Figurinhas para Stories — Design do MVP

**Data:** 2026-07-17
**Status:** Aprovado em brainstorm, aguardando revisão final do spec

## 1. Contexto e objetivo

App iOS nativo de figurinhas (stickers PNG transparentes) para Instagram Stories, voltado a profissionais de saúde/estética. Inspiração direta: **HOF Stories Criativos** (Maiara Milena / maimilena.com.br) — app gratuito na App Store com biblioteca de figurinhas organizadas por tema, fluxo "copiar → colar no Stories", nota 4.9.

**Modelo de negócio:** a idealizadora (médica) cria as artes e vende pacotes de figurinhas para outros profissionais da área. O caso de uso central: o profissional monta um story com a foto do paciente (rosto/corpo) no editor do Instagram e usa as figurinhas do app para apontar/marcar/anotar o que deseja comunicar — a edição acontece **dentro do Instagram**, não no app.

**Decisões de escopo tomadas no brainstorm:**

- Abordagem A escolhida: conteúdo embutido no app, sem backend, estrutura preparada para evoluir (conteúdo remoto e cobrança) sem retrabalho.
- Monetização adiada: MVP publica com todos os pacotes desbloqueados; o manifesto já carrega o campo `free` por pacote para ativar IAP depois.
- Artes fornecidas pela idealizadora (PNGs). O app entrega estrutura, não conteúdo.
- Nome comercial definido: **Body Creator**. O ícone atual é provisório; a identidade visual final continua sendo um insumo da idealizadora antes do envio à App Store.

## 2. Experiência de uso

### Telas (4)

1. **Início (Pacotes)** — lista de pacotes com capa, nome e quantidade de figurinhas.
2. **Grade do pacote** — grid de 3 colunas; chips de categoria no topo (ex: "Setas e marcações", "Frases", "Antes/Depois"); busca por nome/tag.
3. **Detalhe da figurinha** — sheet de meia tela ao tocar: preview grande sobre fundo xadrez (evidencia a transparência), botão primário **"Copiar e abrir Instagram"**, botão secundário "Só copiar", coração de favoritar.
4. **Favoritos** — grade com favoritas de todos os pacotes; é a tela de uso diário.

### O fluxo de 10 segundos (núcleo do produto)

Profissional montando o story com a foto do paciente → troca para o app → Favoritos → toca na figurinha → app copia o PNG e abre o Instagram → profissional cola (toque longo) e posiciona a figurinha sobre a foto.

### Onboarding

Na primeira execução, 3 passos ilustrando o gesto copiar → Instagram → colar. É o principal ponto de fricção desse tipo de app (confirmado pelos reviews do HOF). O conteúdo do onboarding reflete o comportamento real testado em aparelho, pois o gesto de colar varia entre versões do Instagram (campo de texto vs. botão "Adicionar figurinha").

## 3. Arquitetura

**Stack:** SwiftUI puro, iOS 16+, iPhone (iPad via modo compatibilidade). Zero dependências externas. Distribuição via App Store Connect.

### Módulos

| Módulo | Responsabilidade | Depende de |
|---|---|---|
| **Catalog** | Ler `manifest.json` do bundle e expor `StickerPack → StickerCategory → Sticker`. Única fonte de verdade do conteúdo. | Foundation |
| **Favorites** | Persistir `id`s favoritados em `UserDefaults`. | Foundation |
| **Export** | Converter figurinha em PNG (transparência preservada) → `UIPasteboard` → abrir `instagram://story-camera`. | UIKit (pasteboard/URL) |
| **UI** | As 4 telas + onboarding, alimentadas pelos módulos acima. | Catalog, Favorites, Export |

A UI nunca sabe de onde vêm os dados: a evolução futura para conteúdo remoto acontece somente dentro do módulo Catalog, trocando a fonte (bundle → servidor) atrás da mesma interface.

### Modelo de dados (manifest.json)

```json
{
  "version": 1,
  "packs": [
    {
      "id": "harmonizacao-facial",
      "name": "Harmonização Facial",
      "cover": "harmonizacao-facial/cover.png",
      "free": true,
      "categories": [
        {
          "id": "setas-marcacoes",
          "name": "Setas e marcações",
          "stickers": [
            {
              "id": "seta-fina-01",
              "name": "Seta fina",
              "tags": ["seta", "apontar"],
              "file": "harmonizacao-facial/seta-fina-01.png"
            }
          ]
        }
      ]
    }
  ]
}
```

Este schema é o mesmo que um servidor serviria no futuro — o campo `version` permite migração.

### Pipeline de conteúdo

Pasta `Content/` no projeto: `manifest.json` + um diretório de PNGs por pacote. Adicionar pacote = soltar PNGs + editar o JSON + submeter update do app. Um **script de validação roda como build phase** e falha o build se: arquivo referenciado não existe, `id` duplicado, PNG sem canal alfa, arquivo acima de 2 MB, ou lado maior fora da faixa 512–2048 px. Especificação recomendada das figurinhas: PNG com fundo transparente, 1024 px no lado maior.

### Estrutura de diretórios

```
Figurinhas/
  App/          # entry point, navegação, onboarding
  Catalog/      # modelos + ManifestLoader + CatalogStore
  Favorites/    # FavoritesStore
  Export/       # StickerExporter
  UI/           # PacksListView, PackGridView, StickerDetailSheet, FavoritesView
  Content/      # manifest.json + PNGs por pacote
  Scripts/      # validação de conteúdo (build phase)
  Tests/        # unitários
```

## 4. Tratamento de erros

| Cenário | Comportamento |
|---|---|
| Instagram não instalado | Alerta "Instale o Instagram para usar as figurinhas" com link para a App Store; "Só copiar" segue funcionando (colável no WhatsApp etc.). |
| Manifesto inválido / PNG faltando | Impossível em produção — o script de validação falha o build. Em runtime, figurinha que não carregar é omitida da grade; nunca crash. |
| Falha ao copiar (raro) | Toast "Não foi possível copiar, tente de novo". |

Todas as mensagens em português.

## 5. Testes

- **Unitários:** parsing do manifesto (válido e malformado), favoritos (adicionar/remover/persistir), busca e filtro por tags.
- **Script de validação de conteúdo** roda a cada build — protege o ponto de entrada de trabalho manual (as artes).
- **Checklist manual em iPhone real antes de cada release:** copiar → abrir Instagram → colar sobre foto no Stories (fluxo não automatizável).

## 5b. Fluxo Instagram (revisado após teste em aparelho — 2026-07-18)

O modelo original ("copiar → abrir a câmera do story → colar manualmente") gerou fricção no teste real: `instagram://story-camera` força uma foto nova e a figurinha não aparece sozinha. Decisão do usuário: a foto do paciente **já está tirada** (na galeria); o profissional a escolhe no app e o Instagram abre com ela de fundo e a figurinha por cima.

Implementação: **API oficial "Sharing to Stories"** do Instagram. O app coloca no pasteboard `com.instagram.sharedSticker.backgroundImage` (a foto escolhida, re-encodada em JPEG) + `com.instagram.sharedSticker.stickerImage` (o PNG da figurinha, bytes inalterados para preservar o alfa) e abre `instagram-stories://share?source_application=<FacebookAppID>`.

- **Dependência obrigatória:** Facebook App ID (exigido pela Meta desde jan/2023). Fica em `Export/InstagramSharing.swift`; sem ele o botão avisa que a integração está pendente.
- **Foto:** o botão "Usar no Instagram" abre um menu com duas origens — **"Tirar foto agora"** (câmera dentro do app, via `UIImagePickerController`; exige `NSCameraUsageDescription`) e **"Escolher da galeria"** (`PhotosPicker`, processo isolado, sem prompt de permissão). Em ambos os casos a foto vai só para o pasteboard local → Instagram; não é armazenada nem enviada a servidor. A label de privacidade "Dados não coletados" permanece válida.
- **Fallback mantido:** "Só copiar a figurinha" (PNG no pasteboard) para colar manualmente em qualquer app.

### Débito técnico registrado (fora do MVP)
- **Várias figurinhas numa mesma composição via API:** a API oficial envia uma figurinha por compartilhamento; múltiplas anotações numa só imagem hoje só pelo caminho "Só copiar" + colar repetidamente.

## 6. Fora do MVP (estrutura já preparada)

- Cobrança (IAP por pacote ou assinatura) — campo `free` já existe no manifesto.
- Conteúdo remoto/CDN, login, painel admin, Android.
- Personalização de cor das figurinhas (candidata forte a v2).
- Captura de foto dentro do app (ver débito técnico em 5b).

## 7. Privacidade e App Store

A foto do paciente nunca entra no app: nenhum dado sensível é tratado, nenhum dado é coletado. Privacy label "Data Not Collected", sem necessidade de política de LGPD para dados de pacientes — e isso é argumento de venda para o público médico.
