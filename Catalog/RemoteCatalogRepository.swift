import CryptoKit
import Foundation

struct CatalogPointer: Codable, Equatable {
    let version: Int
    let manifest: URL
    let checksum: String
}

struct RemoteCatalogSnapshot: Codable, Equatable {
    let manifest: StickerManifest
    let assetBaseURL: URL
}

enum RemoteCatalogError: LocalizedError, Equatable {
    case unavailable(String)
    case invalidResponse
    case checksumMismatch
    case invalidAsset

    var errorDescription: String? {
        switch self {
        case let .unavailable(message): return message
        case .invalidResponse: return "O catálogo publicado está inválido."
        case .checksumMismatch: return "A verificação de integridade do catálogo falhou."
        case .invalidAsset: return "A figurinha baixada não é um PNG válido."
        }
    }
}

struct RemoteCatalogRepository {
    let pointerURL: URL
    let cacheDirectory: URL
    let session: URLSession

    static var live: RemoteCatalogRepository {
        let base = AppConfiguration.apiBaseURL
        let pointer = base.appendingPathComponent("catalog").appendingPathComponent("current")
        let applicationSupport = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first ?? FileManager.default.temporaryDirectory
        return RemoteCatalogRepository(
            pointerURL: pointer,
            cacheDirectory: applicationSupport
                .appendingPathComponent("BodyCreator", isDirectory: true)
                .appendingPathComponent("Catalog", isDirectory: true),
            session: .shared
        )
    }

    func cachedSnapshot() -> RemoteCatalogSnapshot? {
        guard let data = try? Data(contentsOf: snapshotURL) else { return nil }
        return try? JSONDecoder().decode(RemoteCatalogSnapshot.self, from: data)
    }

    func refresh() async throws -> RemoteCatalogSnapshot {
        let pointerData = try await download(pointerURL)
        let pointer: CatalogPointer
        do {
            pointer = try JSONDecoder().decode(CatalogPointer.self, from: pointerData)
        } catch {
            throw RemoteCatalogError.invalidResponse
        }

        let manifestData = try await download(pointer.manifest)
        let actualChecksum = SHA256.hash(data: manifestData)
            .map { String(format: "%02x", $0) }
            .joined()
        guard actualChecksum == pointer.checksum.lowercased() else {
            throw RemoteCatalogError.checksumMismatch
        }

        let manifest: StickerManifest
        do {
            manifest = try JSONDecoder().decode(StickerManifest.self, from: manifestData)
        } catch {
            throw RemoteCatalogError.invalidResponse
        }
        guard manifest.version == pointer.version else {
            throw RemoteCatalogError.invalidResponse
        }

        let catalogDirectory = pointer.manifest.deletingLastPathComponent()
        let assetBaseURL = catalogDirectory.lastPathComponent == "catalog"
            ? catalogDirectory.deletingLastPathComponent()
            : catalogDirectory
        let snapshot = RemoteCatalogSnapshot(manifest: manifest, assetBaseURL: assetBaseURL)
        try persist(snapshot)
        return snapshot
    }

    func remoteURL(for path: String, snapshot: RemoteCatalogSnapshot) -> URL {
        path.split(separator: "/").reduce(snapshot.assetBaseURL) {
            $0.appendingPathComponent(String($1))
        }
    }

    func cachedAssetURL(for remoteURL: URL) -> URL? {
        let target = assetCacheURL(for: remoteURL)
        return FileManager.default.fileExists(atPath: target.path) ? target : nil
    }

    func localAssetURL(for remoteURL: URL) async throws -> URL {
        let target = assetCacheURL(for: remoteURL)
        if FileManager.default.fileExists(atPath: target.path) { return target }

        let data = try await download(remoteURL)
        let signature = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        guard data.starts(with: signature) else { throw RemoteCatalogError.invalidAsset }

        try FileManager.default.createDirectory(
            at: target.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try data.write(to: target, options: .atomic) // nunca reencoda o PNG
        return target
    }

    private var snapshotURL: URL { cacheDirectory.appendingPathComponent("snapshot.json") }

    private func assetCacheURL(for url: URL) -> URL {
        let digest = SHA256.hash(data: Data(url.absoluteString.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return cacheDirectory
            .appendingPathComponent("assets", isDirectory: true)
            .appendingPathComponent("\(digest).png")
    }

    private func persist(_ snapshot: RemoteCatalogSnapshot) throws {
        try FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(snapshot)
        try data.write(to: snapshotURL, options: .atomic)
    }

    private func download(_ url: URL) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(from: url)
        } catch {
            throw RemoteCatalogError.unavailable(
                "Não foi possível atualizar o catálogo. O conteúdo salvo continua disponível."
            )
        }
        guard let http = response as? HTTPURLResponse else {
            throw RemoteCatalogError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            if let envelope = try? JSONDecoder().decode(CatalogErrorEnvelope.self, from: data) {
                throw RemoteCatalogError.unavailable(envelope.error)
            }
            throw RemoteCatalogError.unavailable(
                "Não foi possível atualizar o catálogo. O conteúdo salvo continua disponível."
            )
        }
        return data
    }
}

private struct CatalogErrorEnvelope: Decodable {
    let error: String
}
