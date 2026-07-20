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

    static let sampleManifestWithStorefrontJSON = """
    {
      "version": 2,
      "storefront": {
        "hero": "pack-a",
        "sections": [
          { "id": "novidades", "title": "Novidades", "packs": ["pack-b", "fantasma"] },
          { "id": "vazia", "title": "Vazia", "packs": ["fantasma"] }
        ]
      },
      "packs": [
        { "id": "pack-a", "name": "Pacote A", "cover": "pack-a/cover.png", "free": true,
          "categories": [ { "id": "c", "name": "C", "stickers": [
            { "id": "seta-1", "name": "S", "tags": [], "file": "pack-a/seta-1.png" } ] } ] },
        { "id": "pack-b", "name": "Pacote B", "cover": "pack-b/cover.png", "free": false,
          "productId": "com.daige.bodycreator.pack.pack-b",
          "categories": [ { "id": "c2", "name": "C2", "stickers": [
            { "id": "seta-2", "name": "S2", "tags": [], "file": "pack-b/seta-2.png" } ] } ] }
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
