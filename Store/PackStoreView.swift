import SwiftUI

struct PackStoreView: View {
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var purchases: PurchaseStore

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Conteúdo para os seus stories", systemImage: "sparkles")
                        .font(.headline)
                    Text("Cada pacote pago é uma compra única. Depois de comprar, ele fica na sua biblioteca e pode ser restaurado em outro iPhone com a mesma Conta Apple.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }

            Section("Pacotes") {
                if catalog.packs.isEmpty {
                    Text("Nenhum pacote disponível no momento.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(catalog.packs) { pack in
                        StorePackRow(pack: pack)
                    }
                }
            }

            Section {
                Button {
                    Task { await purchases.restore() }
                } label: {
                    Label(
                        purchases.isRestoring ? "Restaurando…" : "Restaurar compras",
                        systemImage: "arrow.clockwise"
                    )
                }
                .disabled(purchases.isRestoring)
                .accessibilityIdentifier("restore-purchases")

                if let loadMessage = purchases.loadMessage {
                    Text(loadMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("Loja")
        .refreshable {
            await catalog.refresh()
            await purchases.load(packs: catalog.packs)
        }
        .alert("Loja", isPresented: Binding(
            get: { purchases.alertMessage != nil },
            set: { if !$0 { purchases.alertMessage = nil } }
        )) {
            Button("OK") { purchases.alertMessage = nil }
        } message: {
            Text(purchases.alertMessage ?? "")
        }
    }
}

private struct StorePackRow: View {
    let pack: StickerPack
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var purchases: PurchaseStore

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                StickerImageView(url: catalog.coverURL(for: pack))
                    .frame(width: 72, height: 72)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                VStack(alignment: .leading, spacing: 4) {
                    Text(pack.name).font(.headline)
                    if let description = pack.description, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    Text("\(pack.allStickers.count) figurinhas")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if purchases.hasAccess(to: pack) {
                HStack {
                    Label(pack.free ? "Incluído" : "Comprado", systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.green)
                    Spacer()
                    NavigationLink {
                        PackGridView(pack: pack)
                    } label: {
                        Text("Abrir")
                    }
                    .buttonStyle(.bordered)
                }
            } else if let product = purchases.product(for: pack) {
                Button {
                    Task { await purchases.purchase(pack) }
                } label: {
                    HStack {
                        Text(purchases.purchasingProductID == product.id ? "Comprando…" : "Comprar")
                        Spacer()
                        Text(product.displayPrice)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(purchases.purchasingProductID != nil)
                .accessibilityIdentifier("buy-\(pack.id)")
            } else {
                Label("Indisponível na App Store", systemImage: "clock")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 6)
    }
}
