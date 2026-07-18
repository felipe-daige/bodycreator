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
