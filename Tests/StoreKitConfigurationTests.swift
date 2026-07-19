import StoreKitTest
import XCTest
@testable import Figurinhas

final class StoreKitConfigurationTests: XCTestCase {
    func testLocalConfigurationProvidesAndPurchasesDemoProduct() async throws {
        let session = try SKTestSession(configurationFileNamed: "BodyCreator")
        session.disableDialogs = true
        session.clearTransactions()
        defer { session.clearTransactions() }

        let productID = "com.daige.bodycreator.pack.premium-exemplo"
        let products = try await StoreService.live.products([productID])
        XCTAssertEqual(products.map(\.id), [productID])
        XCTAssertFalse(products[0].displayPrice.isEmpty)

        let result = try await StoreService.live.purchase(productID)
        guard case let .purchased(entitlement) = result else {
            return XCTFail("A configuração local deveria concluir a compra não consumível.")
        }
        XCTAssertEqual(entitlement.productID, productID)
        XCTAssertFalse(entitlement.signedTransaction.isEmpty)
        await entitlement.finish()
    }
}
