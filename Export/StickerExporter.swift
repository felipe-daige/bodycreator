import UIKit
import UniformTypeIdentifiers

protocol URLOpening {
    func canOpenURL(_ url: URL) -> Bool
    func open(_ url: URL)
}

struct SystemURLOpener: URLOpening {
    func canOpenURL(_ url: URL) -> Bool {
        UIApplication.shared.canOpenURL(url)
    }

    func open(_ url: URL) {
        UIApplication.shared.open(url)
    }
}

enum ExportOutcome: Equatable {
    case copiedAndOpenedInstagram
    case copiedOnly
    case instagramNotInstalled
    case copyFailed
}

@MainActor
struct StickerExporter {
    static let instagramStoriesURL = URL(string: "instagram://story-camera")!
    static let instagramAppStoreURL = URL(string: "https://apps.apple.com/app/instagram/id389801252")!

    private let pasteboard: UIPasteboard
    private let opener: URLOpening

    init(pasteboard: UIPasteboard = .general, opener: URLOpening = SystemURLOpener()) {
        self.pasteboard = pasteboard
        self.opener = opener
    }

    func copyOnly(imageAt url: URL) -> ExportOutcome {
        copyToPasteboard(imageAt: url) ? .copiedOnly : .copyFailed
    }

    func copyAndOpenInstagram(imageAt url: URL) -> ExportOutcome {
        guard copyToPasteboard(imageAt: url) else { return .copyFailed }
        guard opener.canOpenURL(Self.instagramStoriesURL) else { return .instagramNotInstalled }
        opener.open(Self.instagramStoriesURL)
        return .copiedAndOpenedInstagram
    }

    // Os bytes do PNG vão inalterados para o pasteboard: re-encodar via UIImage
    // descartaria metadados e pode perder o canal alfa.
    private func copyToPasteboard(imageAt url: URL) -> Bool {
        guard let data = try? Data(contentsOf: url), UIImage(data: data) != nil else {
            return false
        }
        pasteboard.setData(data, forPasteboardType: UTType.png.identifier)
        return true
    }
}
