import CryptoKit
import XCTest
@testable import Figurinhas

final class RemoteCatalogRepositoryTests: XCTestCase {
    override func tearDown() {
        URLProtocolStub.handler = nil
        super.tearDown()
    }

    func testRefreshValidatesAndCachesManifestAndExactAsset() async throws {
        let manifestData = Data(TestFixtures.sampleManifestJSON.replacingOccurrences(
            of: "\"version\": 1", with: "\"version\": 2"
        ).utf8)
        let checksum = SHA256.hash(data: manifestData).map { String(format: "%02x", $0) }.joined()
        let asset = TestFixtures.transparentPNGData()
        let pointerURL = URL(string: "https://api.test/catalog/current")!
        let manifestURL = URL(string: "https://cdn.test/catalog/v2.json")!
        let cache = try TestFixtures.makeContentDir()

        URLProtocolStub.handler = { request in
            let data: Data
            switch request.url {
            case pointerURL:
                data = try JSONEncoder().encode(CatalogPointer(
                    version: 2, manifest: manifestURL, checksum: checksum
                ))
            case manifestURL:
                data = manifestData
            case URL(string: "https://cdn.test/pack-a/seta-1.png")!:
                data = asset
            default:
                XCTFail("URL inesperada: \(String(describing: request.url))")
                data = Data()
            }
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, data)
        }

        let repository = RemoteCatalogRepository(
            pointerURL: pointerURL, cacheDirectory: cache, session: URLProtocolStub.session()
        )
        let snapshot = try await repository.refresh()
        XCTAssertEqual(snapshot.manifest.version, 2)
        XCTAssertEqual(snapshot.assetBaseURL.absoluteString, "https://cdn.test/")
        XCTAssertEqual(repository.cachedSnapshot(), snapshot)

        let remoteAsset = repository.remoteURL(
            for: snapshot.manifest.packs[0].categories[0].stickers[0].file,
            snapshot: snapshot
        )
        let localAsset = try await repository.localAssetURL(for: remoteAsset)
        XCTAssertEqual(try Data(contentsOf: localAsset), asset)
        XCTAssertEqual(repository.cachedAssetURL(for: remoteAsset), localAsset)
    }

    func testRejectsManifestWithWrongChecksum() async throws {
        let pointerURL = URL(string: "https://api.test/catalog/current")!
        let manifestURL = URL(string: "https://cdn.test/catalog/v1.json")!
        URLProtocolStub.handler = { request in
            let data = request.url == pointerURL
                ? try JSONEncoder().encode(CatalogPointer(
                    version: 1, manifest: manifestURL, checksum: String(repeating: "0", count: 64)
                ))
                : Data(TestFixtures.sampleManifestJSON.utf8)
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, data)
        }
        let repository = RemoteCatalogRepository(
            pointerURL: pointerURL,
            cacheDirectory: try TestFixtures.makeContentDir(),
            session: URLProtocolStub.session()
        )

        do {
            _ = try await repository.refresh()
            XCTFail("Deveria recusar checksum")
        } catch let error as RemoteCatalogError {
            XCTAssertEqual(error, .checksumMismatch)
        }
    }

    func testResolvesAPIProxyURLsAndSendsEntitlementToken() async throws {
        let manifestData = Data(TestFixtures.sampleManifestJSON.utf8)
        let checksum = SHA256.hash(data: manifestData).map { String(format: "%02x", $0) }.joined()
        let pointerURL = URL(string: "https://api.test/catalog/current")!
        let manifestURL = URL(string: "https://api.test/catalog/manifests/1")!
        let assetURL = URL(string: "https://api.test/catalog/assets/pack-a/seta-1.png")!
        let asset = TestFixtures.transparentPNGData()

        URLProtocolStub.handler = { request in
            switch request.url {
            case pointerURL:
                let pointer = CatalogPointer(
                    version: 1,
                    manifest: URL(string: "/catalog/manifests/1")!,
                    assets: URL(string: "/catalog/assets")!,
                    checksum: checksum
                )
                return (Self.ok(request.url!), try JSONEncoder().encode(pointer))
            case manifestURL:
                return (Self.ok(request.url!), manifestData)
            case assetURL:
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer acesso")
                return (Self.ok(request.url!), asset)
            default:
                XCTFail("URL inesperada: \(String(describing: request.url))")
                return (Self.ok(request.url!), Data())
            }
        }

        let repository = RemoteCatalogRepository(
            pointerURL: pointerURL,
            cacheDirectory: try TestFixtures.makeContentDir(),
            session: URLProtocolStub.session()
        )
        let snapshot = try await repository.refresh()
        XCTAssertEqual(snapshot.assetBaseURL, URL(string: "https://api.test/catalog/assets")!)
        let remote = repository.remoteURL(
            for: snapshot.manifest.packs[0].categories[0].stickers[0].file,
            snapshot: snapshot
        )
        XCTAssertEqual(remote, assetURL)
        _ = try await repository.localAssetURL(for: remote, bearerToken: "acesso")
    }

    private static func ok(_ url: URL) -> HTTPURLResponse {
        HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!
    }
}
