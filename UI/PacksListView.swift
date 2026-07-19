import SwiftUI

struct PacksListView: View {
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var purchases: PurchaseStore

    private var availablePacks: [StickerPack] {
        catalog.packs.filter { purchases.hasAccess(to: $0) }
    }

    var body: some View {
        Group {
            if availablePacks.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "square.grid.2x2")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text(catalog.packs.isEmpty ? "Nenhum conteúdo disponível" : "Sua biblioteca está vazia")
                        .foregroundStyle(.secondary)
                    if !catalog.packs.isEmpty {
                        Text("Os pacotes comprados aparecem aqui.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                List(availablePacks) { pack in
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
