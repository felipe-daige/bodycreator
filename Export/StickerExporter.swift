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
    case copiedOnly
    case openedInstagramStories
    case instagramNotInstalled
    case missingFacebookAppID
    case copyFailed
}

@MainActor
struct StickerExporter {
    static let instagramAppStoreURL = URL(string: "https://apps.apple.com/app/instagram/id389801252")!

    // Chaves da API oficial "Sharing to Stories" do Instagram.
    static let backgroundImagePasteboardKey = "com.instagram.sharedSticker.backgroundImage"
    static let stickerImagePasteboardKey = "com.instagram.sharedSticker.stickerImage"

    static func storiesShareURL(facebookAppID: String) -> URL {
        URL(string: "instagram-stories://share?source_application=\(facebookAppID)")!
    }

    private let pasteboard: UIPasteboard
    private let opener: URLOpening

    init(pasteboard: UIPasteboard = .general, opener: URLOpening = SystemURLOpener()) {
        self.pasteboard = pasteboard
        self.opener = opener
    }

    /// Copia só a figurinha (PNG com transparência) para o pasteboard, para colar
    /// manualmente em qualquer app.
    func copyOnly(imageAt url: URL) -> ExportOutcome {
        copyToPasteboard(imageAt: url) ? .copiedOnly : .copyFailed
    }

    /// Abre o Instagram Stories já com a foto escolhida como fundo e a figurinha
    /// posicionável por cima, via API oficial. Os bytes da figurinha vão
    /// inalterados (preserva o canal alfa).
    func shareToInstagramStories(
        stickerAt stickerURL: URL,
        backgroundImage backgroundData: Data,
        facebookAppID: String
    ) -> ExportOutcome {
        guard !facebookAppID.isEmpty else { return .missingFacebookAppID }
        guard let stickerData = try? Data(contentsOf: stickerURL), UIImage(data: stickerData) != nil else {
            return .copyFailed
        }
        let shareURL = Self.storiesShareURL(facebookAppID: facebookAppID)
        guard opener.canOpenURL(shareURL) else { return .instagramNotInstalled }

        let items: [[String: Any]] = [[
            Self.backgroundImagePasteboardKey: backgroundData,
            Self.stickerImagePasteboardKey: stickerData,
        ]]
        pasteboard.setItems(items, options: [.expirationDate: Date().addingTimeInterval(300)])
        opener.open(shareURL)
        return .openedInstagramStories
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
