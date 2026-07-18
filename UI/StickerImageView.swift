import SwiftUI

/// Carrega um PNG local; se o arquivo não carregar, não mostra nada (spec: omitir, nunca quebrar).
struct StickerImageView: View {
    let url: URL

    var body: some View {
        if let image = UIImage(contentsOfFile: url.path) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
        }
    }
}
