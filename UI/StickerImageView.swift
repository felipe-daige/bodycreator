import SwiftUI

/// Carrega um PNG local; se o arquivo não carregar, não mostra nada (spec: omitir, nunca quebrar).
struct StickerImageView: View {
    let url: URL
    @EnvironmentObject private var catalog: CatalogStore
    @State private var image: UIImage?
    @State private var isLoading = true

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
        .task(id: url) {
            image = nil
            isLoading = true
            defer { isLoading = false }
            guard let localURL = try? await catalog.localAssetURL(for: url) else {
                return
            }
            image = UIImage(contentsOfFile: localURL.path)
        }
    }
}
