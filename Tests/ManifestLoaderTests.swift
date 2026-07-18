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
