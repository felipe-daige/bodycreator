import SwiftUI

struct StickerCell: View {
    let sticker: Sticker
    let imageURL: URL

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.systemGray6))
            StickerImageView(url: imageURL)
                .padding(10)
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityLabel(sticker.name)
    }
}
