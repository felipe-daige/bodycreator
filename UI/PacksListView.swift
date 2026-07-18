import SwiftUI

struct PacksListView: View {
    @EnvironmentObject private var catalog: CatalogStore

    var body: some View {
        Group {
            if catalog.packs.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "square.grid.2x2")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text("Nenhum conteúdo disponível")
                        .foregroundStyle(.secondary)
                }
            } else {
                List(catalog.packs) { pack in
                    NavigationLink(value: pack) {
                        HStack(spacing: 12) {
                            StickerImageView(url: catalog.coverURL(for: pack))
                                .frame(width: 56, height: 56)
                                .background(Color(.systemGray6))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(pack.name).font(.headline)
                                Text("\(pack.allStickers.count) figurinhas")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .accessibilityIdentifier("pack-\(pack.id)")
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Pacotes")
        .refreshable { await catalog.refresh() }
        .navigationDestination(for: StickerPack.self) { pack in
            PackGridView(pack: pack)
        }
    }
}
