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
