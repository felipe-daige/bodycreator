import XCTest
@testable import Figurinhas

@MainActor
final class PurchaseStoreTests: XCTestCase {
    func testFreePackIsAvailableAndPaidPackUsesStoreProduct() async {
        let product = StoreProductInfo(
            id: productID,
            displayName: "Premium",
            description: "Conteúdo premium",
            displayPrice: "R$ 19,90"
        )
        let store = PurchaseStore(
            service: service(products: [product]),
            validation: validation()
        )

        await store.load(packs: [freePack, paidPack])

        XCTAssertTrue(store.hasAccess(to: freePack))
        XCTAssertFalse(store.hasAccess(to: paidPack))
        XCTAssertEqual(store.product(for: paidPack)?.displayPrice, "R$ 19,90")
    }

    func testSuccessfulPurchaseUnlocksPackAndStoresServerToken() async {
        var didFinish = false
        let entitlement = StoreEntitlement(
            transactionID: 1,
            productID: productID,
            signedTransaction: "signed-jws",
            isRevoked: false,
            finish: { didFinish = true }
        )
        let product = StoreProductInfo(
            id: productID,
            displayName: "Premium",
            description: "Conteúdo premium",
            displayPrice: "R$ 19,90"
        )
        let store = PurchaseStore(
            service: service(products: [product], purchase: .purchased(entitlement)),
            validation: validation(token: "token-do-servidor")
        )
        await store.load(packs: [paidPack])

        await store.purchase(paidPack)

        XCTAssertTrue(store.hasAccess(to: paidPack))
        XCTAssertEqual(store.accessToken(for: paidPack), "token-do-servidor")
        XCTAssertTrue(didFinish)
    }

    func testRestoreReadsCurrentEntitlements() async {
        var didSync = false
        let entitlement = StoreEntitlement(
            transactionID: 2,
            productID: productID,
            signedTransaction: "restored-jws",
            isRevoked: false,
            finish: {}
        )
        let store = PurchaseStore(
            service: service(
                entitlements: [entitlement],
                sync: { didSync = true }
            ),
            validation: validation(token: "restored-token")
        )
        await store.load(packs: [paidPack])

        await store.restore()

        XCTAssertTrue(didSync)
        XCTAssertTrue(store.hasAccess(to: paidPack))
        XCTAssertEqual(store.accessToken(for: paidPack), "restored-token")
    }

    func testExpiredServerTokenIsNotUsedForPaidDownload() async {
        let entitlement = StoreEntitlement(
            transactionID: 3,
            productID: productID,
            signedTransaction: "expired-token-jws",
            isRevoked: false,
            finish: {}
        )
        let store = PurchaseStore(
            service: service(entitlements: [entitlement]),
            validation: validation(expiresAt: Int(Date().timeIntervalSince1970) - 1)
        )

        await store.load(packs: [paidPack])

        XCTAssertTrue(store.hasAccess(to: paidPack))
        XCTAssertNil(store.accessToken(for: paidPack))
    }

    private let productID = "com.daige.bodycreator.pack.premium"

    private var freePack: StickerPack {
        StickerPack(
            id: "free",
            name: "Grátis",
            description: nil,
            cover: "cover.png",
            free: true,
            productID: nil,
            categories: []
        )
    }

    private var paidPack: StickerPack {
        StickerPack(
            id: "paid",
            name: "Premium",
            description: nil,
            cover: "cover.png",
            free: false,
            productID: productID,
            categories: []
        )
    }

    private func service(
        products: [StoreProductInfo] = [],
        purchase: StorePurchaseOutcome = .cancelled,
        entitlements: [StoreEntitlement] = [],
        sync: @escaping () async throws -> Void = {}
    ) -> StoreService {
        StoreService(
            products: { _ in products },
            purchase: { _ in purchase },
            currentEntitlements: { entitlements },
            updates: { AsyncStream { $0.finish() } },
            sync: sync
        )
    }

    private func validation(
        token: String = "token",
        expiresAt: Int = 2_000_000_000
    ) -> StoreValidationClient {
        StoreValidationClient { _ in
            StoreValidationResult(
                productId: self.productID,
                accessToken: token,
                expiresAt: expiresAt
            )
        }
    }
}
