import SwiftUI

struct FavoritesView: View {
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var favorites: FavoritesStore
    @EnvironmentObject private var purchases: PurchaseStore
    @State private var selectedSticker: Sticker?

    var body: some View {
        let stickers = catalog.packs
            .filter { purchases.hasAccess(to: $0) }
            .flatMap(\.allStickers)
            .filter { favorites.ids.contains($0.id) }

        Group {
            if stickers.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "heart")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                    Text("Nenhuma favorita ainda")
                        .font(.headline)
                    Text("Toque no coração de uma figurinha para tê-la sempre à mão aqui.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(32)
            } else {
                ScrollView {
                    LazyVGrid(
                        columns: Array(
                            repeating: GridItem(.flexible(), spacing: 12),
                            count: 3
                        ),
                        spacing: 12
                    ) {
                        ForEach(stickers) { sticker in
                            Button {
                                selectedSticker = sticker
                            } label: {
                                StickerCell(
                                    sticker: sticker,
                                    imageURL: catalog.imageURL(for: sticker),
                                    bearerToken: purchases.accessToken(
                                        for: catalog.pack(containing: sticker)
                                    )
                                )
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("favorite-sticker-\(sticker.id)")
                        }
                    }
                    .padding()
                }
            }
        }
        .navigationTitle("Favoritos")
        .sheet(item: $selectedSticker) { sticker in
            StickerDetailSheet(
                sticker: sticker,
                imageURL: catalog.imageURL(for: sticker),
                bearerToken: purchases.accessToken(for: catalog.pack(containing: sticker))
            )
        }
    }
}
