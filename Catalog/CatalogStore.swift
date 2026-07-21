import Foundation

@MainActor
final class CatalogStore: ObservableObject {
    @Published private(set) var packs: [StickerPack] = []
    @Published private(set) var storefront: Storefront?
    @Published private(set) var isRefreshing = false
    @Published private(set) var refreshMessage: String?
    @Published private(set) var usingRemoteCatalog = false
    @Published private(set) var didJustUpdate = false
    private let loader: ManifestLoader
    private let remote: RemoteCatalogRepository?
    private var remoteSnapshot: RemoteCatalogSnapshot?
    private var successResetTask: Task<Void, Never>?

    init(loader: ManifestLoader, remote: RemoteCatalogRepository? = nil) {
        self.loader = loader
        self.remote = remote
        loadBundled()
        if let snapshot = remote?.cachedSnapshot() {
            apply(snapshot)
        }
    }

    private func loadBundled() {
        guard let manifest = try? loader.load() else {
            packs = []
            storefront = nil
            return
        }
        packs = manifest.packs.map { pack in
            var cleaned = pack
            cleaned.categories = pack.categories.compactMap { category in
                var c = category
                c.stickers = category.stickers.filter {
                    FileManager.default.fileExists(atPath: loader.imageURL(forFile: $0.file).path)
                }
                return c.stickers.isEmpty ? nil : c
            }
            return cleaned
        }
        storefront = manifest.storefront
    }

    /// Uma seção da Loja já com os pacotes resolvidos (ids ausentes ignorados).
    struct ResolvedSection: Identifiable, Equatable {
        let id: String
        let title: String
        let packs: [StickerPack]
    }

    /// Monta as seções da vitrine. Sem storefront (ex.: bundle/demo) cai num
    /// fallback com uma seção única "Pacotes" com todos os pacotes.
    func resolvedSections() -> [ResolvedSection] {
        let byID = Dictionary(packs.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        guard let storefront, !storefront.sections.isEmpty else {
            return packs.isEmpty ? [] : [ResolvedSection(id: "todos", title: "Pacotes", packs: packs)]
        }
        return storefront.sections.compactMap { section in
            let resolved = section.packs.compactMap { byID[$0] }
            return resolved.isEmpty
                ? nil
                : ResolvedSection(id: section.id, title: section.title, packs: resolved)
        }
    }

    func heroPack() -> StickerPack? {
        guard let hero = storefront?.hero else { return nil }
        return packs.first { $0.id == hero }
    }

    func refresh() async {
        guard let remote else { return }
        isRefreshing = true
        refreshMessage = nil
        defer { isRefreshing = false }
        do {
            let snapshot = try await remote.refresh()
            apply(snapshot) // apply ignora manifesto vazio (mantém o bundle)
            if !snapshot.manifest.packs.isEmpty { flashSuccess() }
        } catch RemoteCatalogError.notPublished {
            // Nenhum catálogo publicado ainda: estado benigno. O conteúdo local
            // continua ativo e o usuário comum não vê aviso técnico algum.
            refreshMessage = nil
        } catch {
            // Bundle/cache permanecem ativos. A mensagem é informativa (e só o
            // administrador a vê na interface); uma falha nunca esvazia a
            // biblioteca que já funciona.
            refreshMessage = error.localizedDescription
        }
    }

    private func apply(_ snapshot: RemoteCatalogSnapshot) {
        // Manifesto remoto/cacheado sem pacotes (estado degenerado/legado): ignora
        // e mantém o conteúdo embutido. Vale tanto para o cache aplicado na
        // inicialização quanto para o refresh — a biblioteca nunca fica 100% vazia
        // sem querer. O servidor já recusa publicar catálogo vazio.
        guard !snapshot.manifest.packs.isEmpty else { return }
        remoteSnapshot = snapshot
        usingRemoteCatalog = true
        storefront = snapshot.manifest.storefront
        // Só troca o catálogo quando o conteúdo muda de fato: evita recarregar a
        // lista inteira (e o cascade de StoreKit) a cada atualização sem novidade.
        if packs != snapshot.manifest.packs {
            packs = snapshot.manifest.packs
        }
    }

    /// Marca um pulso de sucesso que a interface mostra por um instante.
    private func flashSuccess() {
        successResetTask?.cancel()
        didJustUpdate = true
        successResetTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            guard !Task.isCancelled else { return }
            self?.didJustUpdate = false
        }
    }

    func imageURL(for sticker: Sticker) -> URL {
        if let snapshot = remoteSnapshot, let remote {
            let url = remote.remoteURL(for: sticker.file, snapshot: snapshot)
            return remote.cachedAssetURL(for: url) ?? url
        }
        return loader.imageURL(forFile: sticker.file)
    }

    func coverURL(for pack: StickerPack) -> URL {
        if let snapshot = remoteSnapshot, let remote {
            let url = remote.remoteURL(for: pack.cover, snapshot: snapshot)
            return remote.cachedAssetURL(for: url) ?? url
        }
        return loader.imageURL(forFile: pack.cover)
    }

    func localImageURL(for sticker: Sticker, bearerToken: String? = nil) async throws -> URL {
        try await localAssetURL(for: imageURL(for: sticker), bearerToken: bearerToken)
    }

    func localAssetURL(for url: URL, bearerToken: String? = nil) async throws -> URL {
        if url.isFileURL { return url }
        guard let remote else { throw RemoteCatalogError.invalidAsset }
        return try await remote.localAssetURL(for: url, bearerToken: bearerToken)
    }

    func pack(containing sticker: Sticker) -> StickerPack? {
        packs.first { pack in pack.categories.contains { $0.stickers.contains(sticker) } }
    }

    func stickers(withIDs ids: Set<String>) -> [Sticker] {
        packs.flatMap(\.allStickers).filter { ids.contains($0.id) }
    }

    nonisolated static func matches(_ sticker: Sticker, query: String) -> Bool {
        let q = normalized(query).trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return true }
        if normalized(sticker.name).contains(q) { return true }
        return sticker.tags.contains { normalized($0).contains(q) }
    }

    private nonisolated static func normalized(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive],
                  locale: Locale(identifier: "pt_BR"))
    }
}
