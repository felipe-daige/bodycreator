import Foundation

@MainActor
final class CatalogStore: ObservableObject {
    @Published private(set) var packs: [StickerPack] = []
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
    }

    func refresh() async {
        guard let remote else { return }
        isRefreshing = true
        refreshMessage = nil
        defer { isRefreshing = false }
        do {
            let snapshot = try await remote.refresh()
            apply(snapshot)
            flashSuccess()
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
        remoteSnapshot = snapshot
        usingRemoteCatalog = true
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
