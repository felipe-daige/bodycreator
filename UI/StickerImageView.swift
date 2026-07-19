import SwiftUI

/// Carrega um PNG local; se o arquivo não carregar, não mostra nada (spec: omitir, nunca quebrar).
struct StickerImageView: View {
    let url: URL
    let bearerToken: String?
    @EnvironmentObject private var catalog: CatalogStore
    @State private var image: UIImage?
    @State private var isLoading = true

    init(url: URL, bearerToken: String? = nil) {
        self.url = url
        self.bearerToken = bearerToken
    }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else if isLoading {
                ProgressView()
            }
        }
        .task(id: AssetRequestID(url: url, bearerToken: bearerToken)) {
            image = nil
            isLoading = true
            defer { isLoading = false }
            guard let localURL = try? await catalog.localAssetURL(
                for: url,
                bearerToken: bearerToken
            ) else {
                return
            }
            image = UIImage(contentsOfFile: localURL.path)
        }
    }
}

private struct AssetRequestID: Hashable {
    let url: URL
    let bearerToken: String?
}
