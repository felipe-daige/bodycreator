import SwiftUI

struct StickerCell: View {
    let sticker: Sticker
    let imageURL: URL
    let bearerToken: String?

    init(sticker: Sticker, imageURL: URL, bearerToken: String? = nil) {
        self.sticker = sticker
        self.imageURL = imageURL
        self.bearerToken = bearerToken
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
            StickerImageView(url: imageURL, bearerToken: bearerToken)
                .padding(10)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityLabel(sticker.name)
    }
}
