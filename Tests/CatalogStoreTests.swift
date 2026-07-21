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

    func testResolvedSectionsFallbackWithoutStorefront() throws {
        let dir = try TestFixtures.makeContentDir()
        try TestFixtures.writeManifest(TestFixtures.sampleManifestJSON, in: dir)
        try TestFixtures.writeSticker(named: "pack-a/seta-1.png", in: dir)
        try TestFixtures.writeSticker(named: "pack-a/coracao-1.png", in: dir)
        let store = CatalogStore(loader: ManifestLoader(contentURL: dir))
        let sections = store.resolvedSections()
        XCTAssertEqual(sections.map(\.id), ["todos"])
        XCTAssertEqual(sections.first?.title, "Pacotes")
        XCTAssertEqual(sections.first?.packs.map(\.id), ["pack-a"])
        XCTAssertNil(store.heroPack())
    }

    func testStorefrontResolvesAndIgnoresMissingIDs() throws {
        let dir = try TestFixtures.makeContentDir()
        try TestFixtures.writeManifest(TestFixtures.sampleManifestWithStorefrontJSON, in: dir)
        try TestFixtures.writeSticker(named: "pack-a/seta-1.png", in: dir)
        try TestFixtures.writeSticker(named: "pack-b/seta-2.png", in: dir)
        let store = CatalogStore(loader: ManifestLoader(contentURL: dir))
        XCTAssertEqual(store.heroPack()?.id, "pack-a")
        // "vazia" some (só tinha fantasma); "novidades" fica só com pack-b.
        let sections = store.resolvedSections()
        XCTAssertEqual(sections.map(\.id), ["novidades"])
        XCTAssertEqual(sections.first?.packs.map(\.id), ["pack-b"])
    }

    func testEmptyCachedSnapshotKeepsBundledContent() throws {
        let dir = try TestFixtures.makeContentDir()
        try TestFixtures.writeManifest(TestFixtures.sampleManifestJSON, in: dir)
        try TestFixtures.writeSticker(named: "pack-a/seta-1.png", in: dir)
        try TestFixtures.writeSticker(named: "pack-a/coracao-1.png", in: dir)

        // Cache remoto com manifesto VAZIO (0 pacotes) — como a v4 publicada na VPS.
        // O app não pode aplicá-lo por cima do bundle e esvaziar a loja.
        let cacheDir = try TestFixtures.makeContentDir()
        let emptySnapshot = #"{"manifest":{"version":9,"packs":[]},"assetBaseURL":"https://example.com"}"#
        try emptySnapshot.data(using: .utf8)!
            .write(to: cacheDir.appendingPathComponent("snapshot.json"))
        let remote = RemoteCatalogRepository(
            pointerURL: URL(string: "https://example.com/catalog/current")!,
            cacheDirectory: cacheDir,
            session: .shared
        )
        let store = CatalogStore(loader: ManifestLoader(contentURL: dir), remote: remote)
        XCTAssertEqual(store.packs.map(\.id), ["pack-a"])
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
