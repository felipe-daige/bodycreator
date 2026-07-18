import XCTest
@testable import Figurinhas

final class SelectedPNGTests: XCTestCase {
    func testReadsPNGWithoutChangingBytes() throws {
        let data = TestFixtures.transparentPNGData()
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID()).png")
        try data.write(to: url)

        let selected = try SelectedPNG.read(from: url)

        XCTAssertEqual(selected.data, data)
        XCTAssertEqual(selected.fileName, url.lastPathComponent)
    }

    func testRejectsNonPNG() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID()).png")
        try Data("não é png".utf8).write(to: url)
        XCTAssertThrowsError(try SelectedPNG.read(from: url)) { error in
            XCTAssertEqual(error.localizedDescription, "Escolha um arquivo PNG válido.")
        }
    }
}
