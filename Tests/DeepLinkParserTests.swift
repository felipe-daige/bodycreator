import XCTest
@testable import Figurinhas

final class DeepLinkParserTests: XCTestCase {
    func testReadsInviteFromAppScheme() {
        let token = String(repeating: "a", count: 64)
        let url = URL(string: "bodycreator://convite?token=\(token)")!
        XCTAssertEqual(DeepLinkParser.inviteToken(from: url), token)
    }

    func testReadsCompatibleWebInvite() {
        let token = String(repeating: "b", count: 64)
        let url = URL(string: "https://bodycreator.test/convite?token=\(token)")!
        XCTAssertEqual(DeepLinkParser.inviteToken(from: url), token)
    }

    func testRejectsWrongRouteAndShortToken() {
        XCTAssertNil(DeepLinkParser.inviteToken(from: URL(string: "bodycreator://outra?token=abc")!))
        XCTAssertNil(DeepLinkParser.inviteToken(from: URL(string: "bodycreator://convite?token=abc")!))
    }
}
