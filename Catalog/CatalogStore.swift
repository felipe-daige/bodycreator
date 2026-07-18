import Foundation

@MainActor
final class CatalogStore: ObservableObject {
    @Published private(set) var packs: [StickerPack] = []
    private let loader: ManifestLoader

    init(loader: ManifestLoader) {
        self.loader = loader
        load()
    }

    private func load() {
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

    func imageURL(for sticker: Sticker) -> URL {
        loader.imageURL(forFile: sticker.file)
    }

    func coverURL(for pack: StickerPack) -> URL {
        loader.imageURL(forFile: pack.cover)
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
