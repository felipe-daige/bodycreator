import XCTest
import UniformTypeIdentifiers
@testable import Figurinhas

@MainActor
final class StickerExporterTests: XCTestCase {
    private final class FakeOpener: URLOpening {
        var canOpen = true
        var opened: [URL] = []
        func canOpenURL(_ url: URL) -> Bool { canOpen }
        func open(_ url: URL) { opened.append(url) }
    }

    private func makeExporter(canOpen: Bool = true) -> (StickerExporter, UIPasteboard, FakeOpener) {
        let pasteboard = UIPasteboard(name: UIPasteboard.Name(rawValue: UUID().uuidString), create: true)!
        let opener = FakeOpener()
        opener.canOpen = canOpen
        return (StickerExporter(pasteboard: pasteboard, opener: opener), pasteboard, opener)
    }

    func testCopyOnlyPutsExactPNGBytesOnPasteboard() throws {
        let dir = try TestFixtures.makeContentDir()
        let url = try TestFixtures.writeSticker(named: "s.png", in: dir)
        let (exporter, pasteboard, opener) = makeExporter()
        XCTAssertEqual(exporter.copyOnly(imageAt: url), .copiedOnly)
        XCTAssertEqual(pasteboard.data(forPasteboardType: UTType.png.identifier),
                       try Data(contentsOf: url))
        XCTAssertTrue(opener.opened.isEmpty)
    }

    func testCopyAndOpenLaunchesInstagram() throws {
        let dir = try TestFixtures.makeContentDir()
        let url = try TestFixtures.writeSticker(named: "s.png", in: dir)
        let (exporter, pasteboard, opener) = makeExporter()
        XCTAssertEqual(exporter.copyAndOpenInstagram(imageAt: url), .copiedAndOpenedInstagram)
        XCTAssertEqual(opener.opened, [StickerExporter.instagramStoriesURL])
        XCTAssertNotNil(pasteboard.data(forPasteboardType: UTType.png.identifier))
    }

    func testInstagramMissingStillCopies() throws {
        let dir = try TestFixtures.makeContentDir()
        let url = try TestFixtures.writeSticker(named: "s.png", in: dir)
        let (exporter, pasteboard, opener) = makeExporter(canOpen: false)
        XCTAssertEqual(exporter.copyAndOpenInstagram(imageAt: url), .instagramNotInstalled)
        XCTAssertTrue(opener.opened.isEmpty)
        XCTAssertNotNil(pasteboard.data(forPasteboardType: UTType.png.identifier))
    }

    func testCopyFailsForMissingFile() {
        let (exporter, _, _) = makeExporter()
        let missing = URL(fileURLWithPath: "/nao/existe.png")
        XCTAssertEqual(exporter.copyOnly(imageAt: missing), .copyFailed)
        XCTAssertEqual(exporter.copyAndOpenInstagram(imageAt: missing), .copyFailed)
    }
}
