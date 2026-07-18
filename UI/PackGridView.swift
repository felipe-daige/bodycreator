import SwiftUI

struct PackGridView: View {
    let pack: StickerPack
    @EnvironmentObject private var catalog: CatalogStore
    @State private var query = ""
    @State private var selectedCategoryID: String?
    @State var selectedSticker: Sticker?

    private var visibleStickers: [Sticker] {
        let base = selectedCategoryID
            .flatMap { id in pack.categories.first { $0.id == id }?.stickers }
            ?? pack.allStickers
        return base.filter { CatalogStore.matches($0, query: query) }
    }

    var body: some View {
        ScrollView {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    categoryChip(id: nil, label: "Todas")
                    ForEach(pack.categories) { category in
                        categoryChip(id: category.id, label: category.name)
                    }
                }
                .padding(.horizontal)
            }
            if visibleStickers.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                    Text("Nenhuma figurinha encontrada")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 64)
            } else {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3),
                          spacing: 12) {
                    ForEach(visibleStickers) { sticker in
                        Button {
                            selectedSticker = sticker
                        } label: {
                            StickerCell(sticker: sticker, imageURL: catalog.imageURL(for: sticker))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("sticker-\(sticker.id)")
                    }
                }
                .padding()
            }
        }
        .searchable(text: $query, prompt: "Buscar figurinha")
        .navigationTitle(pack.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selectedSticker) { sticker in
            StickerDetailSheet(sticker: sticker, imageURL: catalog.imageURL(for: sticker))
        }
    }

    private func categoryChip(id: String?, label: String) -> some View {
        Button {
            selectedCategoryID = id
        } label: {
            Text(label)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(selectedCategoryID == id ? Color.accentColor : Color(.systemGray5))
                .foregroundStyle(selectedCategoryID == id ? Color.white : Color.primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
