# Figurinhas MVP — Implementation Plan

> **Atualização 2026-07-18:** nome comercial definido como **Body Creator** e bundle id atualizado para `com.daige.bodycreator`. O target interno continua se chamando `Figurinhas`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App iOS (SwiftUI) de figurinhas para Instagram Stories: biblioteca de PNGs transparentes organizada em pacotes/categorias, com busca, favoritos e fluxo "copiar → abrir Instagram → colar".

**Architecture:** 4 módulos (Catalog, Favorites, Export, UI) sobre um `manifest.json` embutido no bundle. A UI nunca sabe a origem dos dados (troca futura bundle→servidor fica contida no Catalog). Projeto Xcode gerado por XcodeGen a partir de `project.yml` (o `.xcodeproj` é gerado, não versionado).

**Tech Stack:** Swift 5.9+, SwiftUI, iOS 16.0+, XCTest. Ferramentas de build: XcodeGen (via Homebrew), Python 3 (stdlib, já no macOS) para validação de conteúdo, scripts Swift (CoreGraphics) para gerar assets placeholder. **Zero dependências no app.**

**Spec:** `docs/superpowers/specs/2026-07-17-figurinhas-stories-design.md`

## Global Constraints

- Deployment target: **iOS 16.0** (nada de API iOS 17+, ex.: `ContentUnavailableView`).
- App usa **apenas frameworks da Apple** — nenhum pacote externo no target do app.
- **Todo texto visível ao usuário em pt-BR.**
- `id`s de figurinha são **globais e únicos** no manifesto inteiro (favoritos dependem disso). `id`s de pacote são únicos; `id`s de categoria únicos dentro do pacote.
- Figurinhas: PNG **com canal alfa**, lado maior entre **512–2048 px**, arquivo ≤ **2 MB**.
- iPhone-only (`TARGETED_DEVICE_FAMILY = 1`), retrato.
- Depois de qualquer mudança em `project.yml`, rode `xcodegen generate`.
- Comandos padrão (defina uma vez por sessão de shell, na raiz do repo):

```bash
SIM_NAME=$(xcrun simctl list devices available | grep -m1 -o 'iPhone [^(]*' | sed 's/ *$//')
DEST="platform=iOS Simulator,name=$SIM_NAME"
# testes:
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
# build:
xcodebuild build -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

- Commits frequentes, mensagens `feat:`/`test:`/`chore:` curtas, terminando com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Scaffold do projeto (XcodeGen + app mínima + testes rodando)

**Files:**
- Create: `.gitignore`
- Create: `project.yml`
- Create: `App/FigurinhasApp.swift`
- Create: `App/RootView.swift`
- Create: `Tests/SmokeTests.swift`
- Create: `Content/manifest.json` (mínimo válido; substituído na Task 3)

**Interfaces:**
- Consumes: nada.
- Produces: projeto Xcode gerável (`xcodegen generate` → `Figurinhas.xcodeproj`), scheme `Figurinhas` com target de app e de testes; `RootView` (substituída na Task 8); bundle contém a pasta `Content/` como folder reference.

- [ ] **Step 1: Instalar XcodeGen se necessário**

```bash
which xcodegen || brew install xcodegen
xcodegen --version
```

Expected: imprime a versão (ex.: `Version: 2.4x.x`).

- [ ] **Step 2: Criar .gitignore**

```gitignore
.DS_Store
DerivedData/
build/
*.xcodeproj
xcuserdata/
```

- [ ] **Step 3: Criar project.yml**

```yaml
name: Figurinhas
options:
  createIntermediateGroups: true
  deploymentTarget:
    iOS: "16.0"
settings:
  base:
    SWIFT_VERSION: "5.9"
    ENABLE_USER_SCRIPT_SANDBOXING: NO
targets:
  Figurinhas:
    type: application
    platform: iOS
    sources:
      - path: App
      - path: Catalog
        optional: true
      - path: Favorites
        optional: true
      - path: Export
        optional: true
      - path: UI
        optional: true
      - path: Content
        type: folder
        buildPhase: resources
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.daige.bodycreator
        TARGETED_DEVICE_FAMILY: "1"
        CODE_SIGN_STYLE: Automatic
    info:
      path: App/Info.plist
      properties:
        CFBundleDisplayName: Body Creator
        CFBundleShortVersionString: "1.0"
        CFBundleVersion: "1"
        LSApplicationQueriesSchemes: [instagram]
        UILaunchScreen: {}
        UISupportedInterfaceOrientations: [UIInterfaceOrientationPortrait]
  FigurinhasTests:
    type: bundle.unit-test
    platform: iOS
    sources:
      - path: Tests
    dependencies:
      - target: Figurinhas
schemes:
  Figurinhas:
    build:
      targets:
        Figurinhas: all
    test:
      gatherCoverageData: false
      targets:
        - FigurinhasTests
```

Nota: `optional: true` nas pastas de módulo permite gerar o projeto antes de elas existirem; cada task seguinte cria a sua e roda `xcodegen generate` de novo.

- [ ] **Step 4: Criar o app mínimo**

`App/FigurinhasApp.swift`:

```swift
import SwiftUI

@main
struct FigurinhasApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
```

`App/RootView.swift`:

```swift
import SwiftUI

struct RootView: View {
    var body: some View {
        Text("Figurinhas")
    }
}
```

`Content/manifest.json` (mínimo, só para o bundle não ir vazio):

```json
{
  "version": 1,
  "packs": []
}
```

`Tests/SmokeTests.swift`:

```swift
import XCTest
@testable import Figurinhas

final class SmokeTests: XCTestCase {
    func testAppModuleLinks() {
        XCTAssertTrue(true)
    }
}
```

- [ ] **Step 5: Gerar o projeto e rodar os testes**

```bash
xcodegen generate
SIM_NAME=$(xcrun simctl list devices available | grep -m1 -o 'iPhone [^(]*' | sed 's/ *$//')
DEST="platform=iOS Simulator,name=$SIM_NAME"
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: `** TEST SUCCEEDED **` (1 teste).

- [ ] **Step 6: Commit**

```bash
git add .gitignore project.yml App Content Tests
git commit -m "chore: scaffold Xcode project via XcodeGen with smoke test"
```

---

### Task 2: Modelos do catálogo + ManifestLoader (TDD)

**Files:**
- Create: `Catalog/Models.swift`
- Create: `Catalog/ManifestLoader.swift`
- Create: `Tests/TestFixtures.swift`
- Test: `Tests/ManifestLoaderTests.swift`

**Interfaces:**
- Consumes: nada.
- Produces (usados pelas Tasks 5–10):

```swift
struct StickerManifest: Codable, Equatable { let version: Int; var packs: [StickerPack] }
struct StickerPack: Codable, Equatable, Hashable, Identifiable {
    let id: String; let name: String; let cover: String; let free: Bool
    var categories: [StickerCategory]
    var allStickers: [Sticker]   // categorias achatadas, na ordem do manifesto
}
struct StickerCategory: Codable, Equatable, Hashable, Identifiable {
    let id: String; let name: String; var stickers: [Sticker]
}
struct Sticker: Codable, Equatable, Hashable, Identifiable {
    let id: String; let name: String; let tags: [String]; let file: String
}
enum ManifestError: Error, Equatable { case fileNotFound; case decodingFailed(String) }
struct ManifestLoader {
    let contentURL: URL
    func load() throws -> StickerManifest
    func imageURL(forFile file: String) -> URL
    static var bundled: ManifestLoader   // aponta para <bundle>/Content
}
```

- E, para os demais testes, `TestFixtures` com:

```swift
enum TestFixtures {
    static let sampleManifestJSON: String        // 1 pacote "pack-a", 1 categoria "setas", stickers "seta-1" e "coracao-1"
    static func makeContentDir() throws -> URL   // dir temporário único
    static func transparentPNGData() -> Data     // PNG 10x10 RGBA
    @discardableResult
    static func writeSticker(named file: String, in dir: URL) throws -> URL
    static func writeManifest(_ json: String, in dir: URL) throws
}
```

- [ ] **Step 1: Escrever fixtures e testes que falham**

`Tests/TestFixtures.swift`:

```swift
import UIKit

enum TestFixtures {
    static let sampleManifestJSON = """
    {
      "version": 1,
      "packs": [
        {
          "id": "pack-a",
          "name": "Pacote A",
          "cover": "pack-a/cover.png",
          "free": true,
          "categories": [
            {
              "id": "setas",
              "name": "Setas",
              "stickers": [
                { "id": "seta-1", "name": "Seta fina", "tags": ["seta", "apontar"], "file": "pack-a/seta-1.png" },
                { "id": "coracao-1", "name": "Coração", "tags": ["harmonização"], "file": "pack-a/coracao-1.png" }
              ]
            }
          ]
        }
      ]
    }
    """

    static func makeContentDir() throws -> URL {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("FigurinhasTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func transparentPNGData() -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.opaque = false
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 10, height: 10), format: format)
        let image = renderer.image { ctx in
            UIColor.red.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 5, height: 5))
        }
        return image.pngData()!
    }

    @discardableResult
    static func writeSticker(named file: String, in dir: URL) throws -> URL {
        let url = dir.appendingPathComponent(file)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try transparentPNGData().write(to: url)
        return url
    }

    static func writeManifest(_ json: String, in dir: URL) throws {
        try json.data(using: .utf8)!.write(to: dir.appendingPathComponent("manifest.json"))
    }
}
```

`Tests/ManifestLoaderTests.swift`:

```swift
import XCTest
@testable import Figurinhas

final class ManifestLoaderTests: XCTestCase {
    func testLoadsValidManifest() throws {
        let dir = try TestFixtures.makeContentDir()
        try TestFixtures.writeManifest(TestFixtures.sampleManifestJSON, in: dir)
        let manifest = try ManifestLoader(contentURL: dir).load()
        XCTAssertEqual(manifest.version, 1)
        XCTAssertEqual(manifest.packs.count, 1)
        XCTAssertEqual(manifest.packs[0].id, "pack-a")
        XCTAssertEqual(manifest.packs[0].categories[0].stickers.map(\.id), ["seta-1", "coracao-1"])
        XCTAssertEqual(manifest.packs[0].allStickers.count, 2)
    }

    func testThrowsWhenManifestMissing() throws {
        let dir = try TestFixtures.makeContentDir()
        XCTAssertThrowsError(try ManifestLoader(contentURL: dir).load()) { error in
            XCTAssertEqual(error as? ManifestError, .fileNotFound)
        }
    }

    func testThrowsOnMalformedJSON() throws {
        let dir = try TestFixtures.makeContentDir()
        try TestFixtures.writeManifest("{ \"version\": 1, \"packs\": ", in: dir)
        XCTAssertThrowsError(try ManifestLoader(contentURL: dir).load()) { error in
            guard case .decodingFailed = error as? ManifestError else {
                return XCTFail("esperava decodingFailed, veio \(error)")
            }
        }
    }

    func testImageURLAppendsFile() {
        let loader = ManifestLoader(contentURL: URL(fileURLWithPath: "/content"))
        XCTAssertEqual(loader.imageURL(forFile: "pack-a/seta-1.png").path, "/content/pack-a/seta-1.png")
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: FALHA de compilação (`cannot find 'ManifestLoader' in scope`).

- [ ] **Step 3: Implementar modelos e loader**

`Catalog/Models.swift`:

```swift
import Foundation

struct StickerManifest: Codable, Equatable {
    let version: Int
    var packs: [StickerPack]
}

struct StickerPack: Codable, Equatable, Hashable, Identifiable {
    let id: String
    let name: String
    let cover: String
    let free: Bool
    var categories: [StickerCategory]

    var allStickers: [Sticker] { categories.flatMap(\.stickers) }
}

struct StickerCategory: Codable, Equatable, Hashable, Identifiable {
    let id: String
    let name: String
    var stickers: [Sticker]
}

struct Sticker: Codable, Equatable, Hashable, Identifiable {
    let id: String
    let name: String
    let tags: [String]
    let file: String
}
```

`Catalog/ManifestLoader.swift`:

```swift
import Foundation

enum ManifestError: Error, Equatable {
    case fileNotFound
    case decodingFailed(String)
}

struct ManifestLoader {
    let contentURL: URL

    static var bundled: ManifestLoader {
        ManifestLoader(contentURL: Bundle.main.resourceURL!
            .appendingPathComponent("Content", isDirectory: true))
    }

    func load() throws -> StickerManifest {
        let url = contentURL.appendingPathComponent("manifest.json")
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw ManifestError.fileNotFound
        }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(StickerManifest.self, from: data)
        } catch {
            throw ManifestError.decodingFailed(String(describing: error))
        }
    }

    func imageURL(forFile file: String) -> URL {
        contentURL.appendingPathComponent(file)
    }
}
```

- [ ] **Step 4: Regenerar projeto (nova pasta Catalog) e rodar testes**

```bash
xcodegen generate
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: `** TEST SUCCEEDED **` (5 testes).

- [ ] **Step 5: Commit**

```bash
git add Catalog Tests
git commit -m "feat: catalog models and manifest loader"
```

---

### Task 3: Conteúdo placeholder + script gerador

**Files:**
- Create: `Scripts/generate_placeholders.swift`
- Modify: `Content/manifest.json` (substitui o mínimo da Task 1)
- Create (gerados): `Content/packs/exemplo/*.png` (7 arquivos)

**Interfaces:**
- Consumes: nada.
- Produces: conteúdo real no bundle — pacote `exemplo` com 3 categorias e 6 figurinhas + capa, nos caminhos exatos do manifest abaixo. As Tasks 8–11 exibem esse conteúdo. **Placeholder até as artes finais chegarem** (checklist da Task 12).

- [ ] **Step 1: Escrever o script gerador**

`Scripts/generate_placeholders.swift`:

```swift
#!/usr/bin/env swift
// Gera figurinhas placeholder (PNG 1024x1024 com alfa) em Content/packs/exemplo.
// Uso: swift Scripts/generate_placeholders.swift [dirConteudo]
import Foundation
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

let side = 1024
let contentDir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "Content")
let packDir = contentDir.appendingPathComponent("packs/exemplo", isDirectory: true)
try FileManager.default.createDirectory(at: packDir, withIntermediateDirectories: true)

let roxo = CGColor(red: 0.45, green: 0.20, blue: 0.75, alpha: 1)
let branco = CGColor(red: 1, green: 1, blue: 1, alpha: 1)

func makeContext() -> CGContext {
    CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0,
              space: CGColorSpace(name: CGColorSpace.sRGB)!,
              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
}

func save(_ ctx: CGContext, _ name: String) {
    let url = packDir.appendingPathComponent(name)
    let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
    CGImageDestinationFinalize(dest)
    print("gerado: \(url.path)")
}

func drawCenteredText(_ text: String, size fontSize: CGFloat, color: CGColor, at center: CGPoint, in ctx: CGContext) {
    let font = CTFontCreateWithName("HelveticaNeue-Bold" as CFString, fontSize, nil)
    let attr = NSAttributedString(string: text, attributes: [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
    ])
    let line = CTLineCreateWithAttributedString(attr)
    var ascent: CGFloat = 0, descent: CGFloat = 0
    let width = CGFloat(CTLineGetTypographicBounds(line, &ascent, &descent, nil))
    ctx.textPosition = CGPoint(x: center.x - width / 2, y: center.y - (ascent - descent) / 2)
    CTLineDraw(line, ctx)
}

func arrow(rotation: CGFloat, name: String) {
    let ctx = makeContext()
    ctx.translateBy(x: 512, y: 512)
    ctx.rotate(by: rotation)
    let path = CGMutablePath()
    path.move(to: CGPoint(x: -380, y: 0))
    path.addLine(to: CGPoint(x: 340, y: 0))
    path.move(to: CGPoint(x: 180, y: 160))
    path.addLine(to: CGPoint(x: 340, y: 0))
    path.addLine(to: CGPoint(x: 180, y: -160))
    ctx.addPath(path)
    ctx.setStrokeColor(roxo)
    ctx.setLineWidth(70)
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    ctx.strokePath()
    save(ctx, name)
}

func circleOutline(name: String) {
    let ctx = makeContext()
    ctx.setStrokeColor(roxo)
    ctx.setLineWidth(60)
    ctx.strokeEllipse(in: CGRect(x: 90, y: 90, width: 844, height: 844))
    save(ctx, name)
}

func badge(_ text: String, name: String) {
    let ctx = makeContext()
    let rect = CGRect(x: 42, y: 362, width: 940, height: 300)
    ctx.addPath(CGPath(roundedRect: rect, cornerWidth: 150, cornerHeight: 150, transform: nil))
    ctx.setFillColor(roxo)
    ctx.fillPath()
    drawCenteredText(text, size: 150, color: branco, at: CGPoint(x: rect.midX, y: rect.midY), in: ctx)
    save(ctx, name)
}

func cover(name: String) {
    let ctx = makeContext()
    ctx.addPath(CGPath(roundedRect: CGRect(x: 32, y: 32, width: 960, height: 960),
                       cornerWidth: 180, cornerHeight: 180, transform: nil))
    ctx.setFillColor(roxo)
    ctx.fillPath()
    drawCenteredText("Aa", size: 420, color: branco, at: CGPoint(x: 512, y: 512), in: ctx)
    save(ctx, name)
}

arrow(rotation: 0, name: "seta-reta.png")
arrow(rotation: .pi / 2, name: "seta-cima.png")
circleOutline(name: "circulo.png")
badge("ANTES", name: "badge-antes.png")
badge("DEPOIS", name: "badge-depois.png")
badge("RESULTADO", name: "badge-resultado.png")
cover(name: "cover.png")
print("concluído: 7 arquivos")
```

- [ ] **Step 2: Rodar o script**

```bash
swift Scripts/generate_placeholders.swift Content
ls Content/packs/exemplo
```

Expected: imprime 7 linhas "gerado:" e o `ls` mostra `badge-antes.png badge-depois.png badge-resultado.png circulo.png cover.png seta-cima.png seta-reta.png`.

- [ ] **Step 3: Escrever o manifest real**

Substituir `Content/manifest.json` por:

```json
{
  "version": 1,
  "packs": [
    {
      "id": "exemplo",
      "name": "Pacote de Exemplo",
      "cover": "packs/exemplo/cover.png",
      "free": true,
      "categories": [
        {
          "id": "setas-marcacoes",
          "name": "Setas e marcações",
          "stickers": [
            { "id": "seta-reta", "name": "Seta reta", "tags": ["seta", "apontar", "marcação"], "file": "packs/exemplo/seta-reta.png" },
            { "id": "seta-cima", "name": "Seta para cima", "tags": ["seta", "lifting"], "file": "packs/exemplo/seta-cima.png" },
            { "id": "circulo", "name": "Círculo de destaque", "tags": ["círculo", "marcar", "área"], "file": "packs/exemplo/circulo.png" }
          ]
        },
        {
          "id": "antes-depois",
          "name": "Antes e depois",
          "stickers": [
            { "id": "badge-antes", "name": "Antes", "tags": ["antes", "comparação"], "file": "packs/exemplo/badge-antes.png" },
            { "id": "badge-depois", "name": "Depois", "tags": ["depois", "comparação"], "file": "packs/exemplo/badge-depois.png" }
          ]
        },
        {
          "id": "frases",
          "name": "Frases",
          "stickers": [
            { "id": "badge-resultado", "name": "Resultado", "tags": ["resultado", "frase"], "file": "packs/exemplo/badge-resultado.png" }
          ]
        }
      ]
    }
  ]
}
```

- [ ] **Step 4: Verificar que o app ainda compila com o conteúdo no bundle**

```bash
xcodebuild build -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 5: Commit**

```bash
git add Scripts/generate_placeholders.swift Content
git commit -m "feat: placeholder sticker pack and generator script"
```

---

### Task 4: Validador de conteúdo + build phase

**Files:**
- Create: `Scripts/validate_content.py`
- Modify: `project.yml` (adicionar `preBuildScripts` ao target Figurinhas)

**Interfaces:**
- Consumes: `Content/manifest.json` e PNGs (Task 3).
- Produces: `python3 Scripts/validate_content.py <dirConteudo>` — exit 0 com `OK: N figurinhas validadas...` ou exit 1 listando linhas `ERRO: ...`. Roda em todo build do app.

- [ ] **Step 1: Escrever o validador**

`Scripts/validate_content.py`:

```python
#!/usr/bin/env python3
"""Valida Content/: manifesto coerente e PNGs dentro dos limites do spec.

Regras (spec 2026-07-17): arquivo referenciado existe; ids de pacote únicos;
ids de figurinha únicos GLOBALMENTE; ids de categoria únicos no pacote;
figurinha é PNG com canal alfa, <= 2 MB, lado maior entre 512 e 2048 px;
capa é PNG <= 2 MB.
"""
import json
import os
import struct
import sys

MAX_BYTES = 2 * 1024 * 1024
MIN_SIDE, MAX_SIDE = 512, 2048
ALPHA_COLOR_TYPES = {4, 6}  # gray+alpha, RGBA


def png_header(path):
    """Retorna (largura, altura, color_type) ou None se não for PNG."""
    try:
        with open(path, "rb") as f:
            if f.read(8) != b"\x89PNG\r\n\x1a\n":
                return None
            f.read(4)  # tamanho do chunk
            if f.read(4) != b"IHDR":
                return None
            width, height = struct.unpack(">II", f.read(8))
            f.read(1)  # bit depth
            color_type = f.read(1)[0]
            return width, height, color_type
    except OSError:
        return None


def main():
    content = sys.argv[1] if len(sys.argv) > 1 else "Content"
    errors = []
    try:
        with open(os.path.join(content, "manifest.json")) as f:
            manifest = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"ERRO: manifest.json inválido ou ausente: {e}")
        return 1

    pack_ids, sticker_ids = set(), set()
    checked = 0
    for pack in manifest.get("packs", []):
        pid = pack.get("id", "<sem id>")
        if pid in pack_ids:
            errors.append(f"pacote com id duplicado: {pid}")
        pack_ids.add(pid)
        for key in ("name", "cover", "free", "categories"):
            if key not in pack:
                errors.append(f"pacote {pid}: campo obrigatório ausente: {key}")
        cover = os.path.join(content, pack.get("cover", ""))
        if not os.path.isfile(cover):
            errors.append(f"pacote {pid}: capa não encontrada: {pack.get('cover')}")
        elif png_header(cover) is None:
            errors.append(f"pacote {pid}: capa não é PNG válido")
        elif os.path.getsize(cover) > MAX_BYTES:
            errors.append(f"pacote {pid}: capa acima de 2 MB")

        cat_ids = set()
        for cat in pack.get("categories", []):
            cid = cat.get("id", "<sem id>")
            if cid in cat_ids:
                errors.append(f"pacote {pid}: categoria com id duplicado: {cid}")
            cat_ids.add(cid)
            for st in cat.get("stickers", []):
                sid = st.get("id", "<sem id>")
                if sid in sticker_ids:
                    errors.append(f"figurinha com id duplicado (ids são globais): {sid}")
                sticker_ids.add(sid)
                for key in ("name", "tags", "file"):
                    if key not in st:
                        errors.append(f"figurinha {sid}: campo obrigatório ausente: {key}")
                path = os.path.join(content, st.get("file", ""))
                if not os.path.isfile(path):
                    errors.append(f"figurinha {sid}: arquivo não encontrado: {st.get('file')}")
                    continue
                if os.path.getsize(path) > MAX_BYTES:
                    errors.append(f"figurinha {sid}: arquivo acima de 2 MB")
                header = png_header(path)
                if header is None:
                    errors.append(f"figurinha {sid}: não é PNG válido")
                    continue
                width, height, color_type = header
                if color_type not in ALPHA_COLOR_TYPES:
                    errors.append(f"figurinha {sid}: PNG sem canal alfa (color type {color_type})")
                longest = max(width, height)
                if not (MIN_SIDE <= longest <= MAX_SIDE):
                    errors.append(
                        f"figurinha {sid}: lado maior {longest}px fora da faixa {MIN_SIDE}-{MAX_SIDE}px")
                checked += 1

    if errors:
        for e in errors:
            print(f"ERRO: {e}")
        return 1
    print(f"OK: {checked} figurinhas validadas em {len(pack_ids)} pacote(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Rodar contra o conteúdo válido**

```bash
python3 Scripts/validate_content.py Content
echo "exit: $?"
```

Expected: `OK: 6 figurinhas validadas em 1 pacote(s)` e `exit: 0`.

- [ ] **Step 3: Rodar contra conteúdo quebrado (deve falhar)**

```bash
mkdir -p /tmp/figurinhas-broken
printf '{"version":1,"packs":[{"id":"x","name":"X","cover":"nada.png","free":true,"categories":[{"id":"c","name":"C","stickers":[{"id":"s1","name":"S","tags":[],"file":"faltando.png"},{"id":"s1","name":"S2","tags":[],"file":"faltando.png"}]}]}]}' > /tmp/figurinhas-broken/manifest.json
python3 Scripts/validate_content.py /tmp/figurinhas-broken
echo "exit: $?"
```

Expected: linhas `ERRO:` para capa não encontrada, id duplicado `s1` e arquivos não encontrados; `exit: 1`.

- [ ] **Step 4: Ligar como build phase**

Em `project.yml`, dentro do target `Figurinhas` (mesmo nível de `sources:`), adicionar:

```yaml
    preBuildScripts:
      - name: Validate Content
        script: /usr/bin/python3 "$SRCROOT/Scripts/validate_content.py" "$SRCROOT/Content"
        basedOnDependencyAnalysis: false
```

Depois:

```bash
xcodegen generate
xcodebuild build -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: `** BUILD SUCCEEDED **` (o log do build contém a fase "Validate Content").

- [ ] **Step 5: Commit**

```bash
git add Scripts/validate_content.py project.yml
git commit -m "feat: content validation script wired as build phase"
```

---

### Task 5: CatalogStore (TDD)

**Files:**
- Create: `Catalog/CatalogStore.swift`
- Test: `Tests/CatalogStoreTests.swift`

**Interfaces:**
- Consumes: `ManifestLoader`, modelos (Task 2), `TestFixtures` (Task 2).
- Produces (usados pelas Tasks 8–10):

```swift
@MainActor final class CatalogStore: ObservableObject {
    @Published private(set) var packs: [StickerPack]
    init(loader: ManifestLoader)                       // carrega na hora; falha => packs = []
    func imageURL(for sticker: Sticker) -> URL
    func coverURL(for pack: StickerPack) -> URL
    func stickers(withIDs ids: Set<String>) -> [Sticker]   // ordem do catálogo
    nonisolated static func matches(_ sticker: Sticker, query: String) -> Bool
}
```

Comportamento: no carregamento, figurinhas cujo arquivo não existe em disco são omitidas; categorias que ficarem vazias são removidas (spec §4: "nunca crash, figurinha omitida"). Busca: case-insensitive e sem acentos (pt-BR), sobre nome e tags; query vazia/só espaços casa tudo.

- [ ] **Step 1: Escrever testes que falham**

`Tests/CatalogStoreTests.swift`:

```swift
import XCTest
@testable import Figurinhas

@MainActor
final class CatalogStoreTests: XCTestCase {
    func testLoadsPacksAndOmitsMissingFiles() throws {
        let dir = try TestFixtures.makeContentDir()
        try TestFixtures.writeManifest(TestFixtures.sampleManifestJSON, in: dir)
        try TestFixtures.writeSticker(named: "pack-a/seta-1.png", in: dir)
        // pack-a/coracao-1.png fica ausente de propósito
        let store = CatalogStore(loader: ManifestLoader(contentURL: dir))
        XCTAssertEqual(store.packs.count, 1)
        XCTAssertEqual(store.packs[0].categories[0].stickers.map(\.id), ["seta-1"])
    }

    func testRemovesCategoriesLeftEmpty() throws {
        let dir = try TestFixtures.makeContentDir()
        try TestFixtures.writeManifest(TestFixtures.sampleManifestJSON, in: dir)
        // nenhum PNG existe => categoria "setas" fica vazia => removida
        let store = CatalogStore(loader: ManifestLoader(contentURL: dir))
        XCTAssertTrue(store.packs[0].categories.isEmpty)
    }

    func testEmptyPacksOnBrokenManifest() throws {
        let dir = try TestFixtures.makeContentDir()
        try TestFixtures.writeManifest("isto não é json", in: dir)
        XCTAssertTrue(CatalogStore(loader: ManifestLoader(contentURL: dir)).packs.isEmpty)
    }

    func testSearchIgnoresCaseAndAccents() {
        let sticker = Sticker(id: "s", name: "Coração", tags: ["harmonização"], file: "s.png")
        XCTAssertTrue(CatalogStore.matches(sticker, query: "coracao"))
        XCTAssertTrue(CatalogStore.matches(sticker, query: "HARMONIZACAO"))
        XCTAssertTrue(CatalogStore.matches(sticker, query: "   "))
        XCTAssertFalse(CatalogStore.matches(sticker, query: "botox"))
    }

    func testStickersWithIDsKeepsCatalogOrder() throws {
        let dir = try TestFixtures.makeContentDir()
        try TestFixtures.writeManifest(TestFixtures.sampleManifestJSON, in: dir)
        try TestFixtures.writeSticker(named: "pack-a/seta-1.png", in: dir)
        try TestFixtures.writeSticker(named: "pack-a/coracao-1.png", in: dir)
        let store = CatalogStore(loader: ManifestLoader(contentURL: dir))
        let result = store.stickers(withIDs: ["coracao-1", "seta-1"])
        XCTAssertEqual(result.map(\.id), ["seta-1", "coracao-1"])
    }

    func testImageAndCoverURLs() throws {
        let dir = try TestFixtures.makeContentDir()
        try TestFixtures.writeManifest(TestFixtures.sampleManifestJSON, in: dir)
        try TestFixtures.writeSticker(named: "pack-a/seta-1.png", in: dir)
        let store = CatalogStore(loader: ManifestLoader(contentURL: dir))
        let sticker = store.packs[0].categories[0].stickers[0]
        XCTAssertEqual(store.imageURL(for: sticker).lastPathComponent, "seta-1.png")
        XCTAssertEqual(store.coverURL(for: store.packs[0]).lastPathComponent, "cover.png")
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: FALHA de compilação (`cannot find 'CatalogStore' in scope`).

- [ ] **Step 3: Implementar**

`Catalog/CatalogStore.swift`:

```swift
import Foundation

@MainActor
final class CatalogStore: ObservableObject {
    @Published private(set) var packs: [StickerPack] = []
    private let loader: ManifestLoader

    init(loader: ManifestLoader) {
        self.loader = loader
        load()
    }

    private func load() {
        guard let manifest = try? loader.load() else {
            packs = []
            return
        }
        packs = manifest.packs.map { pack in
            var cleaned = pack
            cleaned.categories = pack.categories.compactMap { category in
                var c = category
                c.stickers = category.stickers.filter {
                    FileManager.default.fileExists(atPath: loader.imageURL(forFile: $0.file).path)
                }
                return c.stickers.isEmpty ? nil : c
            }
            return cleaned
        }
    }

    func imageURL(for sticker: Sticker) -> URL {
        loader.imageURL(forFile: sticker.file)
    }

    func coverURL(for pack: StickerPack) -> URL {
        loader.imageURL(forFile: pack.cover)
    }

    func stickers(withIDs ids: Set<String>) -> [Sticker] {
        packs.flatMap(\.allStickers).filter { ids.contains($0.id) }
    }

    nonisolated static func matches(_ sticker: Sticker, query: String) -> Bool {
        let q = normalized(query).trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return true }
        if normalized(sticker.name).contains(q) { return true }
        return sticker.tags.contains { normalized($0).contains(q) }
    }

    private nonisolated static func normalized(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive],
                  locale: Locale(identifier: "pt_BR"))
    }
}
```

- [ ] **Step 4: Rodar testes**

```bash
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 5: Commit**

```bash
git add Catalog Tests
git commit -m "feat: catalog store with search and missing-file filtering"
```

---

### Task 6: FavoritesStore (TDD)

**Files:**
- Create: `Favorites/FavoritesStore.swift`
- Test: `Tests/FavoritesStoreTests.swift`

**Interfaces:**
- Consumes: nada (só Foundation).
- Produces (usado pelas Tasks 9–10):

```swift
@MainActor final class FavoritesStore: ObservableObject {
    @Published private(set) var ids: Set<String>
    init(defaults: UserDefaults = .standard)
    func isFavorite(_ id: String) -> Bool
    func toggle(_ id: String)
}
```

Persistência: chave `favoriteStickerIDs` como `[String]` ordenado.

- [ ] **Step 1: Escrever testes que falham**

`Tests/FavoritesStoreTests.swift`:

```swift
import XCTest
@testable import Figurinhas

@MainActor
final class FavoritesStoreTests: XCTestCase {
    private var suiteName: String!
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "FavoritesTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        super.tearDown()
    }

    func testStartsEmpty() {
        XCTAssertTrue(FavoritesStore(defaults: defaults).ids.isEmpty)
    }

    func testToggleAddsAndRemoves() {
        let store = FavoritesStore(defaults: defaults)
        store.toggle("seta-1")
        XCTAssertTrue(store.isFavorite("seta-1"))
        store.toggle("seta-1")
        XCTAssertFalse(store.isFavorite("seta-1"))
    }

    func testPersistsAcrossInstances() {
        FavoritesStore(defaults: defaults).toggle("seta-1")
        XCTAssertTrue(FavoritesStore(defaults: defaults).isFavorite("seta-1"))
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: FALHA de compilação (`cannot find 'FavoritesStore' in scope`).

- [ ] **Step 3: Implementar**

`Favorites/FavoritesStore.swift`:

```swift
import Foundation

@MainActor
final class FavoritesStore: ObservableObject {
    private static let key = "favoriteStickerIDs"
    @Published private(set) var ids: Set<String>
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        ids = Set(defaults.stringArray(forKey: Self.key) ?? [])
    }

    func isFavorite(_ id: String) -> Bool {
        ids.contains(id)
    }

    func toggle(_ id: String) {
        if ids.contains(id) {
            ids.remove(id)
        } else {
            ids.insert(id)
        }
        defaults.set(Array(ids).sorted(), forKey: Self.key)
    }
}
```

- [ ] **Step 4: Regenerar (nova pasta Favorites) e rodar testes**

```bash
xcodegen generate
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 5: Commit**

```bash
git add Favorites Tests
git commit -m "feat: favorites store persisted in UserDefaults"
```

---

### Task 7: StickerExporter (TDD)

**Files:**
- Create: `Export/StickerExporter.swift`
- Test: `Tests/StickerExporterTests.swift`

**Interfaces:**
- Consumes: `TestFixtures` (Task 2).
- Produces (usado pela Task 9):

```swift
protocol URLOpening { func canOpenURL(_ url: URL) -> Bool; func open(_ url: URL) }
struct SystemURLOpener: URLOpening   // encapsula UIApplication.shared

enum ExportOutcome: Equatable {
    case copiedAndOpenedInstagram, copiedOnly, instagramNotInstalled, copyFailed
}

@MainActor struct StickerExporter {
    static let instagramStoriesURL: URL      // instagram://story-camera
    static let instagramAppStoreURL: URL     // página do Instagram na App Store
    init(pasteboard: UIPasteboard = .general, opener: URLOpening = SystemURLOpener())
    func copyOnly(imageAt url: URL) -> ExportOutcome            // .copiedOnly | .copyFailed
    func copyAndOpenInstagram(imageAt url: URL) -> ExportOutcome
}
```

Regra central (spec §4): os bytes do PNG vão **inalterados** para o pasteboard com o type `public.png` — é isso que preserva a transparência ao colar no Instagram. Se o Instagram não estiver instalado, a cópia AINDA acontece (`instagramNotInstalled` = copiado, mas não abriu).

- [ ] **Step 1: Escrever testes que falham**

`Tests/StickerExporterTests.swift`:

```swift
import XCTest
import UniformTypeIdentifiers
@testable import Figurinhas

@MainActor
final class StickerExporterTests: XCTestCase {
    private final class FakeOpener: URLOpening {
        var canOpen = true
        var opened: [URL] = []
        func canOpenURL(_ url: URL) -> Bool { canOpen }
        func open(_ url: URL) { opened.append(url) }
    }

    private func makeExporter(canOpen: Bool = true) -> (StickerExporter, UIPasteboard, FakeOpener) {
        let pasteboard = UIPasteboard(name: UIPasteboard.Name(rawValue: UUID().uuidString), create: true)!
        let opener = FakeOpener()
        opener.canOpen = canOpen
        return (StickerExporter(pasteboard: pasteboard, opener: opener), pasteboard, opener)
    }

    func testCopyOnlyPutsExactPNGBytesOnPasteboard() throws {
        let dir = try TestFixtures.makeContentDir()
        let url = try TestFixtures.writeSticker(named: "s.png", in: dir)
        let (exporter, pasteboard, opener) = makeExporter()
        XCTAssertEqual(exporter.copyOnly(imageAt: url), .copiedOnly)
        XCTAssertEqual(pasteboard.data(forPasteboardType: UTType.png.identifier),
                       try Data(contentsOf: url))
        XCTAssertTrue(opener.opened.isEmpty)
    }

    func testCopyAndOpenLaunchesInstagram() throws {
        let dir = try TestFixtures.makeContentDir()
        let url = try TestFixtures.writeSticker(named: "s.png", in: dir)
        let (exporter, pasteboard, opener) = makeExporter()
        XCTAssertEqual(exporter.copyAndOpenInstagram(imageAt: url), .copiedAndOpenedInstagram)
        XCTAssertEqual(opener.opened, [StickerExporter.instagramStoriesURL])
        XCTAssertNotNil(pasteboard.data(forPasteboardType: UTType.png.identifier))
    }

    func testInstagramMissingStillCopies() throws {
        let dir = try TestFixtures.makeContentDir()
        let url = try TestFixtures.writeSticker(named: "s.png", in: dir)
        let (exporter, pasteboard, opener) = makeExporter(canOpen: false)
        XCTAssertEqual(exporter.copyAndOpenInstagram(imageAt: url), .instagramNotInstalled)
        XCTAssertTrue(opener.opened.isEmpty)
        XCTAssertNotNil(pasteboard.data(forPasteboardType: UTType.png.identifier))
    }

    func testCopyFailsForMissingFile() {
        let (exporter, _, _) = makeExporter()
        let missing = URL(fileURLWithPath: "/nao/existe.png")
        XCTAssertEqual(exporter.copyOnly(imageAt: missing), .copyFailed)
        XCTAssertEqual(exporter.copyAndOpenInstagram(imageAt: missing), .copyFailed)
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: FALHA de compilação (`cannot find 'StickerExporter' in scope`).

- [ ] **Step 3: Implementar**

`Export/StickerExporter.swift`:

```swift
import UIKit
import UniformTypeIdentifiers

protocol URLOpening {
    func canOpenURL(_ url: URL) -> Bool
    func open(_ url: URL)
}

struct SystemURLOpener: URLOpening {
    func canOpenURL(_ url: URL) -> Bool {
        UIApplication.shared.canOpenURL(url)
    }

    func open(_ url: URL) {
        UIApplication.shared.open(url)
    }
}

enum ExportOutcome: Equatable {
    case copiedAndOpenedInstagram
    case copiedOnly
    case instagramNotInstalled
    case copyFailed
}

@MainActor
struct StickerExporter {
    static let instagramStoriesURL = URL(string: "instagram://story-camera")!
    static let instagramAppStoreURL = URL(string: "https://apps.apple.com/app/instagram/id389801252")!

    private let pasteboard: UIPasteboard
    private let opener: URLOpening

    init(pasteboard: UIPasteboard = .general, opener: URLOpening = SystemURLOpener()) {
        self.pasteboard = pasteboard
        self.opener = opener
    }

    func copyOnly(imageAt url: URL) -> ExportOutcome {
        copyToPasteboard(imageAt: url) ? .copiedOnly : .copyFailed
    }

    func copyAndOpenInstagram(imageAt url: URL) -> ExportOutcome {
        guard copyToPasteboard(imageAt: url) else { return .copyFailed }
        guard opener.canOpenURL(Self.instagramStoriesURL) else { return .instagramNotInstalled }
        opener.open(Self.instagramStoriesURL)
        return .copiedAndOpenedInstagram
    }

    // Os bytes do PNG vão inalterados para o pasteboard: re-encodar via UIImage
    // descartaria metadados e pode perder o canal alfa.
    private func copyToPasteboard(imageAt url: URL) -> Bool {
        guard let data = try? Data(contentsOf: url), UIImage(data: data) != nil else {
            return false
        }
        pasteboard.setData(data, forPasteboardType: UTType.png.identifier)
        return true
    }
}
```

- [ ] **Step 4: Regenerar (nova pasta Export) e rodar testes**

```bash
xcodegen generate
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 5: Commit**

```bash
git add Export Tests
git commit -m "feat: sticker exporter with pasteboard copy and Instagram deep link"
```

---

### Task 8: Telas Pacotes + Grade (navegação, chips, busca)

**Files:**
- Create: `UI/StickerImageView.swift`
- Create: `UI/StickerCell.swift`
- Create: `UI/PacksListView.swift`
- Create: `UI/PackGridView.swift`
- Modify: `App/FigurinhasApp.swift`
- Modify: `App/RootView.swift`

**Interfaces:**
- Consumes: `CatalogStore` (Task 5) via `@EnvironmentObject`; modelos (Task 2).
- Produces: `PacksListView` (raiz de navegação), `PackGridView(pack:)`, `StickerCell(sticker:imageURL:)`, `StickerImageView(url:)`. `PackGridView` guarda `@State var selectedSticker: Sticker?` — a Task 9 pluga o sheet nele. `FigurinhasApp` passa a injetar `CatalogStore` e `FavoritesStore` como environment objects (Task 9/10 dependem disso).

- [ ] **Step 1: Implementar as views**

`UI/StickerImageView.swift`:

```swift
import SwiftUI

/// Carrega um PNG local; se o arquivo não carregar, não mostra nada (spec: omitir, nunca quebrar).
struct StickerImageView: View {
    let url: URL

    var body: some View {
        if let image = UIImage(contentsOfFile: url.path) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
        }
    }
}
```

`UI/StickerCell.swift`:

```swift
import SwiftUI

struct StickerCell: View {
    let sticker: Sticker
    let imageURL: URL

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
            StickerImageView(url: imageURL)
                .padding(10)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityLabel(sticker.name)
    }
}
```

`UI/PacksListView.swift`:

```swift
import SwiftUI

struct PacksListView: View {
    @EnvironmentObject private var catalog: CatalogStore

    var body: some View {
        Group {
            if catalog.packs.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "square.grid.2x2")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text("Nenhum conteúdo disponível")
                        .foregroundStyle(.secondary)
                }
            } else {
                List(catalog.packs) { pack in
                    NavigationLink(value: pack) {
                        HStack(spacing: 12) {
                            StickerImageView(url: catalog.coverURL(for: pack))
                                .frame(width: 56, height: 56)
                                .background(Color(.systemGray6))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(pack.name).font(.headline)
                                Text("\(pack.allStickers.count) figurinhas")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Pacotes")
        .navigationDestination(for: StickerPack.self) { pack in
            PackGridView(pack: pack)
        }
    }
}
```

`UI/PackGridView.swift`:

```swift
import SwiftUI

struct PackGridView: View {
    let pack: StickerPack
    @EnvironmentObject private var catalog: CatalogStore
    @State private var query = ""
    @State private var selectedCategoryID: String?
    @State var selectedSticker: Sticker?

    private var visibleStickers: [Sticker] {
        let base = selectedCategoryID
            .flatMap { id in pack.categories.first { $0.id == id }?.stickers }
            ?? pack.allStickers
        return base.filter { CatalogStore.matches($0, query: query) }
    }

    var body: some View {
        ScrollView {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    categoryChip(id: nil, label: "Todas")
                    ForEach(pack.categories) { category in
                        categoryChip(id: category.id, label: category.name)
                    }
                }
                .padding(.horizontal)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3),
                      spacing: 12) {
                ForEach(visibleStickers) { sticker in
                    Button {
                        selectedSticker = sticker
                    } label: {
                        StickerCell(sticker: sticker, imageURL: catalog.imageURL(for: sticker))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
        .searchable(text: $query, prompt: "Buscar figurinha")
        .navigationTitle(pack.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func categoryChip(id: String?, label: String) -> some View {
        Button {
            selectedCategoryID = id
        } label: {
            Text(label)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(selectedCategoryID == id ? Color.accentColor : Color(.systemGray5))
                .foregroundStyle(selectedCategoryID == id ? Color.white : Color.primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
```

`App/RootView.swift` (substituir o conteúdo):

```swift
import SwiftUI

struct RootView: View {
    var body: some View {
        NavigationStack {
            PacksListView()
        }
    }
}
```

`App/FigurinhasApp.swift` (substituir o conteúdo):

```swift
import SwiftUI

@main
struct FigurinhasApp: App {
    @StateObject private var catalog = CatalogStore(loader: .bundled)
    @StateObject private var favorites = FavoritesStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(catalog)
                .environmentObject(favorites)
        }
    }
}
```

- [ ] **Step 2: Regenerar (nova pasta UI), compilar e rodar testes existentes**

```bash
xcodegen generate
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: `** TEST SUCCEEDED **` (nenhum teste novo; garante que nada quebrou).

- [ ] **Step 3: Verificar no simulador**

```bash
xcrun simctl boot "$SIM_NAME" 2>/dev/null || true
open -a Simulator
xcodebuild build -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
APP=$(ls -d ~/Library/Developer/Xcode/DerivedData/Figurinhas-*/Build/Products/Debug-iphonesimulator/Figurinhas.app | head -1)
xcrun simctl install booted "$APP"
xcrun simctl launch booted com.daige.bodycreator
sleep 3
xcrun simctl io booted screenshot /tmp/figurinhas-task8.png
```

Expected: a screenshot mostra a lista "Pacotes" com "Pacote de Exemplo — 6 figurinhas". Navegar manualmente (ou conferir por nova screenshot) até a grade: chips "Todas / Setas e marcações / Antes e depois / Frases" e 6 figurinhas. Busca por "seta" filtra para 2.

- [ ] **Step 4: Commit**

```bash
git add UI App
git commit -m "feat: packs list and sticker grid with category chips and search"
```

---

### Task 9: Detalhe da figurinha + exportação (sheet, alertas, favorito)

**Files:**
- Create: `UI/Checkerboard.swift`
- Create: `UI/StickerDetailSheet.swift`
- Modify: `UI/PackGridView.swift` (pluga o sheet)

**Interfaces:**
- Consumes: `StickerExporter`/`ExportOutcome` (Task 7), `FavoritesStore` (Task 6), `CatalogStore` (Task 5), `PackGridView.selectedSticker` (Task 8).
- Produces: `StickerDetailSheet(sticker:imageURL:)` — usado também pela Task 10 (Favoritos).

- [ ] **Step 1: Implementar**

`UI/Checkerboard.swift`:

```swift
import SwiftUI

/// Fundo xadrez para evidenciar a transparência do PNG.
struct Checkerboard: View {
    var body: some View {
        Canvas { context, size in
            let square: CGFloat = 12
            for row in 0..<Int(ceil(size.height / square)) {
                for col in 0..<Int(ceil(size.width / square)) where (row + col).isMultiple(of: 2) {
                    let rect = CGRect(x: CGFloat(col) * square, y: CGFloat(row) * square,
                                      width: square, height: square)
                    context.fill(Path(rect), with: .color(Color(.systemGray5)))
                }
            }
        }
        .background(Color(.systemBackground))
    }
}
```

`UI/StickerDetailSheet.swift`:

```swift
import SwiftUI

struct StickerDetailSheet: View {
    let sticker: Sticker
    let imageURL: URL
    @EnvironmentObject private var favorites: FavoritesStore
    @State private var statusMessage: String?
    @State private var showInstagramMissingAlert = false
    private let exporter = StickerExporter()

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                Checkerboard()
                StickerImageView(url: imageURL)
                    .padding(24)
            }
            .frame(height: 260)
            .clipShape(RoundedRectangle(cornerRadius: 16))

            HStack {
                Text(sticker.name).font(.headline)
                Spacer()
                Button {
                    favorites.toggle(sticker.id)
                } label: {
                    Image(systemName: favorites.isFavorite(sticker.id) ? "heart.fill" : "heart")
                        .font(.title2)
                        .foregroundStyle(.pink)
                }
                .accessibilityLabel(favorites.isFavorite(sticker.id)
                    ? "Remover dos favoritos" : "Adicionar aos favoritos")
            }

            Button {
                handle(exporter.copyAndOpenInstagram(imageAt: imageURL))
            } label: {
                Text("Copiar e abrir Instagram")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

            Button {
                handle(exporter.copyOnly(imageAt: imageURL))
            } label: {
                Text("Só copiar")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)

            Text(statusMessage ?? " ")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding()
        .presentationDetents([.medium])
        .alert("Instale o Instagram para usar as figurinhas", isPresented: $showInstagramMissingAlert) {
            Button("Ver na App Store") {
                UIApplication.shared.open(StickerExporter.instagramAppStoreURL)
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("A figurinha já foi copiada — você também pode colar em outros apps, como o WhatsApp.")
        }
    }

    private func handle(_ outcome: ExportOutcome) {
        switch outcome {
        case .copiedAndOpenedInstagram:
            statusMessage = "Copiado! Toque e segure na tela do story e cole."
        case .copiedOnly:
            statusMessage = "Copiado! Agora é só colar onde quiser."
        case .instagramNotInstalled:
            showInstagramMissingAlert = true
        case .copyFailed:
            statusMessage = "Não foi possível copiar, tente de novo."
        }
    }
}
```

Em `UI/PackGridView.swift`, adicionar o sheet logo após `.navigationBarTitleDisplayMode(.inline)`:

```swift
        .sheet(item: $selectedSticker) { sticker in
            StickerDetailSheet(sticker: sticker, imageURL: catalog.imageURL(for: sticker))
        }
```

- [ ] **Step 2: Compilar + testes**

```bash
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 3: Verificar no simulador**

```bash
xcodebuild build -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
APP=$(ls -d ~/Library/Developer/Xcode/DerivedData/Figurinhas-*/Build/Products/Debug-iphonesimulator/Figurinhas.app | head -1)
xcrun simctl install booted "$APP"
xcrun simctl launch booted com.daige.bodycreator
```

Tocar numa figurinha: sheet sobe com preview sobre xadrez. "Copiar e abrir Instagram" no simulador (sem Instagram) deve mostrar o alerta "Instale o Instagram…" — é o caminho de erro correto. "Só copiar" mostra "Copiado! Agora é só colar onde quiser.". Favoritar alterna o coração.

```bash
xcrun simctl io booted screenshot /tmp/figurinhas-task9.png
```

Expected: screenshot do sheet aberto.

- [ ] **Step 4: Commit**

```bash
git add UI
git commit -m "feat: sticker detail sheet with export flow and favorite toggle"
```

---

### Task 10: Aba Favoritos + TabView raiz

**Files:**
- Create: `UI/FavoritesView.swift`
- Modify: `App/RootView.swift`

**Interfaces:**
- Consumes: `FavoritesStore.ids` (Task 6), `CatalogStore.stickers(withIDs:)` e `imageURL(for:)` (Task 5), `StickerCell` (Task 8), `StickerDetailSheet` (Task 9).
- Produces: `FavoritesView`; `RootView` vira `TabView` com abas "Pacotes" e "Favoritos" (a Task 11 modifica `RootView` de novo para o onboarding).

- [ ] **Step 1: Implementar**

`UI/FavoritesView.swift`:

```swift
import SwiftUI

struct FavoritesView: View {
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var favorites: FavoritesStore
    @State private var selectedSticker: Sticker?

    var body: some View {
        let stickers = catalog.stickers(withIDs: favorites.ids)
        Group {
            if stickers.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "heart")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text("Nenhuma favorita ainda")
                        .font(.headline)
                    Text("Toque no coração de uma figurinha para tê-la sempre à mão aqui.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(32)
            } else {
                ScrollView {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3),
                              spacing: 12) {
                        ForEach(stickers) { sticker in
                            Button {
                                selectedSticker = sticker
                            } label: {
                                StickerCell(sticker: sticker, imageURL: catalog.imageURL(for: sticker))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding()
                }
            }
        }
        .navigationTitle("Favoritos")
        .sheet(item: $selectedSticker) { sticker in
            StickerDetailSheet(sticker: sticker, imageURL: catalog.imageURL(for: sticker))
        }
    }
}
```

`App/RootView.swift` (substituir o conteúdo):

```swift
import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            NavigationStack {
                PacksListView()
            }
            .tabItem { Label("Pacotes", systemImage: "square.grid.2x2") }

            NavigationStack {
                FavoritesView()
            }
            .tabItem { Label("Favoritos", systemImage: "heart") }
        }
    }
}
```

- [ ] **Step 2: Compilar + testes**

```bash
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 3: Verificar no simulador**

Build → install → launch. Aba Favoritos vazia mostra o estado "Nenhuma favorita ainda". Favoritar uma figurinha na grade → ela aparece em Favoritos → tocar nela abre o mesmo sheet. Fechar e reabrir o app: favorito persiste.

```bash
xcrun simctl io booted screenshot /tmp/figurinhas-task10.png
```

- [ ] **Step 4: Commit**

```bash
git add UI App
git commit -m "feat: favorites tab with persistent quick-access grid"
```

---

### Task 11: Onboarding de 3 passos (primeira execução)

**Files:**
- Create: `App/OnboardingView.swift`
- Modify: `App/RootView.swift`

**Interfaces:**
- Consumes: nada novo.
- Produces: `OnboardingView(onFinish:)`; flag `hasCompletedOnboarding` em `UserDefaults` via `@AppStorage`.

- [ ] **Step 1: Implementar**

`App/OnboardingView.swift`:

```swift
import SwiftUI

struct OnboardingView: View {
    let onFinish: () -> Void
    @State private var page = 0

    private let steps: [(icon: String, title: String, text: String)] = [
        ("hand.tap",
         "Escolha a figurinha",
         "Navegue pelos pacotes, toque na figurinha e depois em \"Copiar e abrir Instagram\"."),
        ("camera",
         "Monte seu story",
         "No Instagram, crie o story normalmente com a foto que quiser."),
        ("doc.on.clipboard",
         "Cole a figurinha",
         "Toque e segure na tela do story e escolha Colar. Depois é só posicionar e redimensionar."),
    ]

    var body: some View {
        VStack {
            TabView(selection: $page) {
                ForEach(steps.indices, id: \.self) { index in
                    VStack(spacing: 24) {
                        Image(systemName: steps[index].icon)
                            .font(.system(size: 72))
                            .foregroundStyle(Color.accentColor)
                        Text(steps[index].title)
                            .font(.title2.bold())
                        Text(steps[index].text)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.secondary)
                    }
                    .padding(32)
                    .tag(index)
                }
            }
            .tabViewStyle(.page)
            .indexViewStyle(.page(backgroundDisplayMode: .always))

            Button {
                if page < steps.count - 1 {
                    page += 1
                } else {
                    onFinish()
                }
            } label: {
                Text(page < steps.count - 1 ? "Próximo" : "Começar")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding([.horizontal, .bottom], 32)
        }
    }
}
```

`App/RootView.swift` (substituir o conteúdo):

```swift
import SwiftUI

struct RootView: View {
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @State private var showOnboarding = false

    var body: some View {
        TabView {
            NavigationStack {
                PacksListView()
            }
            .tabItem { Label("Pacotes", systemImage: "square.grid.2x2") }

            NavigationStack {
                FavoritesView()
            }
            .tabItem { Label("Favoritos", systemImage: "heart") }
        }
        .onAppear { showOnboarding = !hasCompletedOnboarding }
        .fullScreenCover(isPresented: $showOnboarding) {
            OnboardingView {
                hasCompletedOnboarding = true
                showOnboarding = false
            }
        }
    }
}
```

- [ ] **Step 2: Compilar + testes**

```bash
xcodebuild test -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: `** TEST SUCCEEDED **`.

- [ ] **Step 3: Verificar no simulador**

Apagar o app do simulador para resetar o flag e reinstalar:

```bash
xcrun simctl uninstall booted com.daige.bodycreator
xcodebuild build -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
APP=$(ls -d ~/Library/Developer/Xcode/DerivedData/Figurinhas-*/Build/Products/Debug-iphonesimulator/Figurinhas.app | head -1)
xcrun simctl install booted "$APP"
xcrun simctl launch booted com.daige.bodycreator
```

Expected: onboarding aparece na primeira abertura; "Próximo" ×2 → "Começar" fecha; relançar o app não mostra onboarding de novo.

```bash
xcrun simctl io booted screenshot /tmp/figurinhas-task11.png
```

- [ ] **Step 4: Commit**

```bash
git add App
git commit -m "feat: three-step onboarding on first launch"
```

---

### Task 12: Preparação para publicação (privacy manifest, ícone, checklist)

**Files:**
- Create: `App/PrivacyInfo.xcprivacy`
- Create: `Scripts/generate_appicon.swift`
- Create (gerados): `App/Assets.xcassets/AppIcon.appiconset/Contents.json` + `AppIcon.png`
- Create: `docs/RELEASE_CHECKLIST.md`
- Modify: `project.yml` (ícone + privacy manifest como resource)

**Interfaces:**
- Consumes: projeto completo (Tasks 1–11).
- Produces: app archivável para a App Store com privacy manifest (UserDefaults = required-reason API, motivo CA92.1), ícone placeholder e checklist de release.

- [ ] **Step 1: Privacy manifest**

`App/PrivacyInfo.xcprivacy`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array/>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```

- [ ] **Step 2: Gerar ícone placeholder**

`Scripts/generate_appicon.swift`:

```swift
#!/usr/bin/env swift
// Gera App/Assets.xcassets/AppIcon.appiconset (ícone 1024, SEM alfa — exigência da App Store).
import Foundation
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

let iconDir = URL(fileURLWithPath: "App/Assets.xcassets/AppIcon.appiconset", isDirectory: true)
try FileManager.default.createDirectory(at: iconDir, withIntermediateDirectories: true)

let ctx = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.setFillColor(CGColor(red: 0.45, green: 0.20, blue: 0.75, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))

let font = CTFontCreateWithName("HelveticaNeue-Bold" as CFString, 560, nil)
let attr = NSAttributedString(string: "F", attributes: [
    NSAttributedString.Key(kCTFontAttributeName as String): font,
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(red: 1, green: 1, blue: 1, alpha: 1),
])
let line = CTLineCreateWithAttributedString(attr)
var ascent: CGFloat = 0, descent: CGFloat = 0
let width = CGFloat(CTLineGetTypographicBounds(line, &ascent, &descent, nil))
ctx.textPosition = CGPoint(x: 512 - width / 2, y: 512 - (ascent - descent) / 2)
CTLineDraw(line, ctx)

let pngURL = iconDir.appendingPathComponent("AppIcon.png")
let dest = CGImageDestinationCreateWithURL(pngURL as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
CGImageDestinationFinalize(dest)

let contents = """
{
  "images" : [
    { "filename" : "AppIcon.png", "idiom" : "universal", "platform" : "ios", "size" : "1024x1024" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
"""
try contents.write(to: iconDir.appendingPathComponent("Contents.json"), atomically: true, encoding: .utf8)
print("ícone gerado em \(pngURL.path)")
```

Rodar:

```bash
swift Scripts/generate_appicon.swift
```

Expected: `ícone gerado em .../AppIcon.png`.

- [ ] **Step 3: Atualizar project.yml**

No target `Figurinhas`: em `settings.base`, adicionar:

```yaml
        ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon
```

(O `Assets.xcassets` e o `PrivacyInfo.xcprivacy` estão dentro de `App/`, que já é source do target — XcodeGen os trata como resources automaticamente.)

```bash
xcodegen generate
xcodebuild build -project Figurinhas.xcodeproj -scheme Figurinhas -destination "$DEST" -quiet
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Checklist de release**

`docs/RELEASE_CHECKLIST.md`:

```markdown
# Checklist de release — Body Creator

## Antes de TODO envio à App Store
- [ ] `python3 Scripts/validate_content.py Content` → OK
- [ ] Testes verdes: `xcodebuild test ...`
- [ ] **Teste em iPhone real com Instagram instalado:**
  - [ ] Copiar figurinha → Instagram abre no modo story
  - [ ] Colar (toque longo) → figurinha aparece COM transparência
  - [ ] Se o gesto de colar mudou nesta versão do Instagram, atualizar os textos do OnboardingView
- [ ] Favoritos persistem após fechar o app
- [ ] Onboarding aparece só na primeira abertura (apagar e reinstalar para testar)

## Somente no primeiro envio (trocar placeholders)
- [ ] Substituir `Content/packs/exemplo` pelas artes finais (rodar o validador)
- [ ] Substituir ícone placeholder (`App/Assets.xcassets/AppIcon.appiconset/AppIcon.png`, 1024×1024 sem alfa)
- [ ] Confirmar o nome comercial Body Creator no App Store Connect
- [ ] Definir bundle id definitivo (`PRODUCT_BUNDLE_IDENTIFIER`) e time de assinatura (conta Apple Developer)
- [ ] App Store Connect: privacy label = "Data Not Collected" (o app não coleta nada)
- [ ] Screenshots para a ficha (iPhone 6.7" e 6.1")
- [ ] Ficha em pt-BR: subtítulo, descrição, palavras-chave
```

- [ ] **Step 5: Commit**

```bash
git add App project.yml Scripts/generate_appicon.swift docs/RELEASE_CHECKLIST.md
git commit -m "chore: privacy manifest, placeholder app icon, release checklist"
```

---

## Cobertura do spec (verificação final)

| Requisito do spec | Task |
|---|---|
| 4 telas (Pacotes, Grade, Detalhe, Favoritos) | 8, 9, 10 |
| Onboarding 3 passos na primeira execução | 11 |
| Busca por nome/tag + chips de categoria | 5 (lógica), 8 (UI) |
| Favoritos persistentes | 6, 10 |
| Copiar PNG com transparência + abrir Instagram | 7, 9 |
| Manifesto JSON future-proof (`version`, `free`) | 2, 3 |
| Pipeline de conteúdo + validação no build | 3, 4 |
| Erro: Instagram ausente (alerta + App Store + "só copiar" segue) | 7, 9 |
| Erro: manifesto inválido → catálogo vazio, figurinha faltando → omitida | 5, 8 |
| Erro: falha ao copiar → mensagem | 9 |
| Privacidade: nada coletado, privacy manifest | 12 |
| Testes unitários (manifesto, favoritos, busca, exportação) | 2, 5, 6, 7 |
| Checklist manual de release | 12 |
