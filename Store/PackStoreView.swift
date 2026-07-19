import SwiftUI

struct PackStoreView: View {
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var purchases: PurchaseStore

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 18) {
                StoreHeaderCard()

                if catalog.packs.isEmpty {
                    StoreEmptyState()
                        .padding(.top, 32)
                } else {
                    ForEach(catalog.packs) { pack in
                        StorePackCard(pack: pack)
                    }
                }

                StoreFooter()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 20)
            .animation(.easeInOut(duration: 0.3), value: catalog.packs)
        }
        .background(Color(.systemGroupedBackground))
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

private struct StoreHeaderCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Conteúdo para os seus stories", systemImage: "sparkles")
                .font(.headline)
                .foregroundStyle(.tint)
            Text("Cada pacote pago é uma compra única. Depois de comprar, ele fica na sua biblioteca e pode ser restaurado em outro iPhone com a mesma Conta Apple.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct StorePackCard: View {
    let pack: StickerPack
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var purchases: PurchaseStore

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            cover
            details
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.06))
        )
        .shadow(color: Color.black.opacity(0.06), radius: 10, x: 0, y: 4)
    }

    private var cover: some View {
        ZStack(alignment: .topTrailing) {
            StickerImageView(url: catalog.coverURL(for: pack), fill: true)
                .frame(maxWidth: .infinity)
                .frame(height: 168)
                .background(Color(.systemGray6))
                .clipped()

            priceTag
                .padding(12)
        }
    }

    @ViewBuilder private var priceTag: some View {
        if pack.free {
            StoreTag(text: "Grátis", tint: .green)
        } else if purchases.hasAccess(to: pack) {
            StoreTag(text: "Comprado", tint: .green, systemImage: "checkmark.seal.fill")
        } else if let product = purchases.product(for: pack) {
            StoreTag(text: product.displayPrice, tint: .accentColor)
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(pack.name)
                    .font(.title3.weight(.semibold))
                if let description = pack.description, !description.isEmpty {
                    Text(description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }
                Text("\(pack.allStickers.count) figurinhas")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            actions
        }
        .padding(16)
    }

    @ViewBuilder private var actions: some View {
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
                        .frame(maxWidth: 120)
                }
                .buttonStyle(.bordered)
            }
        } else if let product = purchases.product(for: pack) {
            Button {
                Task { await purchases.purchase(pack) }
            } label: {
                HStack(spacing: 8) {
                    if purchases.purchasingProductID == product.id {
                        ProgressView().tint(.white)
                        Text("Comprando…")
                    } else {
                        Image(systemName: "cart.fill")
                        Text("Comprar por \(product.displayPrice)")
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(purchases.purchasingProductID != nil)
            .accessibilityIdentifier("buy-\(pack.id)")
        } else {
            Label("Indisponível na App Store", systemImage: "clock")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}

private struct StoreTag: View {
    let text: String
    let tint: Color
    var systemImage: String?

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage)
            }
            Text(text)
        }
        .font(.caption.weight(.bold))
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(tint.opacity(0.35)))
        .foregroundStyle(tint)
    }
}

private struct StoreEmptyState: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "bag")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text("Nenhum pacote disponível no momento.")
                .font(.headline)
            Text("Puxe para baixo para atualizar a loja.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .multilineTextAlignment(.center)
    }
}

private struct StoreFooter: View {
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var purchases: PurchaseStore

    var body: some View {
        VStack(spacing: 8) {
            Button {
                Task {
                    await purchases.restore()
                    await purchases.load(packs: catalog.packs)
                }
            } label: {
                Label(
                    purchases.isRestoring ? "Restaurando…" : "Restaurar compras",
                    systemImage: "arrow.clockwise"
                )
                .font(.subheadline)
            }
            .disabled(purchases.isRestoring)
            .accessibilityIdentifier("restore-purchases")

            if let loadMessage = purchases.loadMessage {
                Text(loadMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.top, 8)
    }
}
