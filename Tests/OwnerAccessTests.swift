import XCTest
@testable import Figurinhas

final class OwnerAccessTests: XCTestCase {
    func testRecognizesOnlyOwnerEmailIgnoringCaseAndWhitespace() {
        XCTAssertTrue(OwnerAccess.isAdministrator("  FelipeDaige@GMAIL.com\n"))
        XCTAssertFalse(OwnerAccess.isAdministrator("outra-pessoa@gmail.com"))
        XCTAssertFalse(OwnerAccess.isAdministrator(nil))
    }
}
