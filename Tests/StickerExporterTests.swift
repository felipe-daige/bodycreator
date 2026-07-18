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

    func testCopyOnlyFailsForMissingFile() {
        let (exporter, _, _) = makeExporter()
        let missing = URL(fileURLWithPath: "/nao/existe.png")
        XCTAssertEqual(exporter.copyOnly(imageAt: missing), .copyFailed)
    }

    func testShareToStoriesSetsBothPasteboardItemsAndOpensStories() throws {
        let dir = try TestFixtures.makeContentDir()
        let stickerURL = try TestFixtures.writeSticker(named: "seta.png", in: dir)
        let background = Data([0xFF, 0xD8, 0xFF, 0xAA, 0xBB]) // bytes de fundo quaisquer
        let (exporter, pasteboard, opener) = makeExporter()

        let outcome = exporter.shareToInstagramStories(
            stickerAt: stickerURL, backgroundImage: background, facebookAppID: "123456")
        XCTAssertEqual(outcome, .openedInstagramStories)

        XCTAssertEqual(opener.opened, [StickerExporter.storiesShareURL(facebookAppID: "123456")])
        let item = try XCTUnwrap(pasteboard.items.first)
        XCTAssertEqual(item[StickerExporter.backgroundImagePasteboardKey] as? Data, background)
        XCTAssertEqual(item[StickerExporter.stickerImagePasteboardKey] as? Data,
                       try Data(contentsOf: stickerURL))
    }

    func testShareToStoriesReportsMissingInstagram() throws {
        let dir = try TestFixtures.makeContentDir()
        let stickerURL = try TestFixtures.writeSticker(named: "seta.png", in: dir)
        let (exporter, _, opener) = makeExporter(canOpen: false)

        let outcome = exporter.shareToInstagramStories(
            stickerAt: stickerURL, backgroundImage: Data([0x1]), facebookAppID: "123456")
        XCTAssertEqual(outcome, .instagramNotInstalled)
        XCTAssertTrue(opener.opened.isEmpty)
    }

    func testShareToStoriesRequiresFacebookAppID() throws {
        let dir = try TestFixtures.makeContentDir()
        let stickerURL = try TestFixtures.writeSticker(named: "seta.png", in: dir)
        let (exporter, _, opener) = makeExporter()

        let outcome = exporter.shareToInstagramStories(
            stickerAt: stickerURL, backgroundImage: Data([0x1]), facebookAppID: "")
        XCTAssertEqual(outcome, .missingFacebookAppID)
        XCTAssertTrue(opener.opened.isEmpty)
    }

    func testShareToStoriesFailsForMissingSticker() {
        let (exporter, _, _) = makeExporter()
        let missing = URL(fileURLWithPath: "/nao/existe.png")
        XCTAssertEqual(
            exporter.shareToInstagramStories(
                stickerAt: missing, backgroundImage: Data([0x1]), facebookAppID: "123456"),
            .copyFailed)
    }
}
