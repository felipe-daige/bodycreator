import SwiftUI

struct PackStoreView: View {
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var purchases: PurchaseStore
    @EnvironmentObject private var favorites: FavoritesStore
    @State private var selectedPack: StickerPack?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                let sections = catalog.resolvedSections()

                if let hero = catalog.heroPack() {
                    StoreHeroCard(pack: hero) { selectedPack = hero }
                        .padding(.horizontal, 16)
                }

                if catalog.heroPack() == nil && sections.isEmpty {
                    StoreEmptyState().padding(.top, 40)
                } else {
                    ForEach(sections) { section in
                        StoreSectionView(section: section) { selectedPack = $0 }
                    }
                }

                StoreFooter().padding(.horizontal, 16)
            }
            .padding(.vertical, 18)
            .animation(.easeInOut(duration: 0.3), value: catalog.packs)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Loja")
        .refreshable {
            await catalog.refresh()
            await purchases.load(packs: catalog.packs)
        }
        .sheet(item: $selectedPack) { pack in
            StorePackDetailView(pack: pack)
                .environmentObject(catalog)
                .environmentObject(purchases)
                .environmentObject(favorites)
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

// MARK: - Herói

private struct StoreHeroCard: View {
    let pack: StickerPack
    let onTap: () -> Void
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var purchases: PurchaseStore

    var body: some View {
        Button(action: onTap) {
            ZStack(alignment: .bottomLeading) {
                LinearGradient(colors: [.accentColor, .accentColor.opacity(0.6)],
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                StickerImageView(url: catalog.coverURL(for: pack), fill: true)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
                    .opacity(0.9)
                LinearGradient(colors: [.black.opacity(0.55), .clear],
                               startPoint: .bottom, endPoint: .center)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .top) {
                        StoreTag(text: "★ Destaque", tint: .white)
                        Spacer()
                        StatePill(pack: pack)
                    }
                    Spacer()
                    Text(pack.name)
                        .font(.title2.weight(.heavy))
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.35), radius: 4, y: 1)
                    Text("\(pack.allStickers.count) figurinhas")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.92))
                }
                .padding(16)
            }
            .frame(height: 172)
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: .accentColor.opacity(0.28), radius: 12, x: 0, y: 6)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("store-hero-\(pack.id)")
    }
}

// MARK: - Seção + card

private struct StoreSectionView: View {
    let section: CatalogStore.ResolvedSection
    let onSelect: (StickerPack) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(section.title)
                .font(.title3.weight(.bold))
                .padding(.horizontal, 16)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(section.packs) { pack in
                        StorePackCard(pack: pack) { onSelect(pack) }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}

private struct StorePackCard: View {
    let pack: StickerPack
    let onTap: () -> Void
    @EnvironmentObject private var catalog: CatalogStore

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                ZStack(alignment: .bottomTrailing) {
                    StickerImageView(url: catalog.coverURL(for: pack), fill: true)
                        .frame(width: 132, height: 108)
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    StatePill(pack: pack).padding(7)
                }
                Text(pack.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text("\(pack.allStickers.count) figurinhas")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(width: 132, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("store-pack-\(pack.id)")
    }
}

/// Etiqueta de estado: Grátis / preço da App Store / Comprado.
private struct StatePill: View {
    let pack: StickerPack
    @EnvironmentObject private var purchases: PurchaseStore

    var body: some View {
        if pack.free {
            StoreTag(text: "Grátis", tint: .green, filled: true)
        } else if purchases.hasAccess(to: pack) {
            StoreTag(text: "Comprado", tint: .green, filled: true)
        } else if let product = purchases.product(for: pack) {
            StoreTag(text: product.displayPrice, tint: .white)
        }
    }
}

private struct StoreTag: View {
    let text: String
    let tint: Color
    var filled: Bool = false

    var body: some View {
        Text(text)
            .font(.caption.weight(.bold))
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .foregroundStyle(filled ? .white : tint)
            .background {
                if filled { Capsule().fill(tint) }
                else { Capsule().fill(.ultraThinMaterial) }
            }
    }
}

private struct StoreEmptyState: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "bag").font(.system(size: 40)).foregroundStyle(.secondary)
            Text("Nenhum pacote disponível no momento.").font(.headline)
            Text("Puxe para baixo para atualizar a loja.")
                .font(.subheadline).foregroundStyle(.secondary)
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
                Task { await purchases.restore(); await purchases.load(packs: catalog.packs) }
            } label: {
                Label(purchases.isRestoring ? "Restaurando…" : "Restaurar compras",
                      systemImage: "arrow.clockwise").font(.subheadline)
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
        .padding(.top, 4)
    }
}

// MARK: - Detalhe do pacote (sheet)

private struct StorePackDetailView: View {
    let pack: StickerPack
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var purchases: PurchaseStore
    @Environment(\.dismiss) private var dismiss
    @State private var localError: String?

    private var owned: Bool { purchases.hasAccess(to: pack) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    StickerImageView(url: catalog.coverURL(for: pack), fill: true)
                        .frame(height: 200)
                        .frame(maxWidth: .infinity)
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

                    VStack(alignment: .leading, spacing: 6) {
                        Text(pack.name).font(.title2.weight(.bold))
                        if let description = pack.description, !description.isEmpty {
                            Text(description).font(.body).foregroundStyle(.secondary)
                        }
                        Text("\(pack.allStickers.count) figurinhas em \(pack.categories.count) categorias")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }

                    if owned {
                        StickerPreviewGrid(pack: pack)
                    } else {
                        CategoryChips(pack: pack)
                    }

                    if let localError {
                        Text(localError).font(.footnote).foregroundStyle(.red)
                    }
                }
                .padding(16)
            }
            .safeAreaInset(edge: .bottom) { cta }
            .navigationTitle(pack.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fechar") { dismiss() }
                }
            }
        }
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder private var cta: some View {
        VStack(spacing: 8) {
            if owned {
                NavigationLink {
                    PackGridView(pack: pack)
                } label: {
                    Text("Abrir pacote").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            } else if let product = purchases.product(for: pack) {
                Button {
                    Task {
                        await purchases.purchase(pack)
                        if purchases.hasAccess(to: pack) {
                            dismiss()
                        } else if let message = purchases.alertMessage {
                            localError = message
                            purchases.alertMessage = nil
                        }
                    }
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

                Button("Restaurar compras") {
                    Task { await purchases.restore(); await purchases.load(packs: catalog.packs) }
                }
                .font(.subheadline)
                .disabled(purchases.isRestoring)
            } else {
                Label("Indisponível na App Store", systemImage: "clock")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .background(.regularMaterial)
    }
}

/// Grade de prévia só para pacote liberado (grátis/comprado). Pacote pago não
/// comprado nunca baixa PNG protegido — mostra apenas as categorias.
private struct StickerPreviewGrid: View {
    let pack: StickerPack
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var purchases: PurchaseStore
    private let columns = [GridItem(.adaptive(minimum: 72), spacing: 10)]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ForEach(pack.allStickers) { sticker in
                StickerImageView(url: catalog.imageURL(for: sticker),
                                 bearerToken: purchases.accessToken(for: pack))
                    .frame(width: 72, height: 72)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }
}

private struct CategoryChips: View {
    let pack: StickerPack

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Inclui").font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(pack.categories) { category in
                        Text(category.name)
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color.accentColor.opacity(0.12), in: Capsule())
                            .foregroundStyle(Color.accentColor)
                    }
                }
            }
        }
    }
}
