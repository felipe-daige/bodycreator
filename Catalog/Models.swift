import Foundation

struct StickerManifest: Codable, Equatable {
    let version: Int
    var packs: [StickerPack]
}

struct StickerPack: Codable, Equatable, Hashable, Identifiable {
    let id: String
    let name: String
    let cover: String
    let free: Bool
    var categories: [StickerCategory]

    var allStickers: [Sticker] { categories.flatMap(\.stickers) }
}

struct StickerCategory: Codable, Equatable, Hashable, Identifiable {
    let id: String
    let name: String
    var stickers: [Sticker]
}

struct Sticker: Codable, Equatable, Hashable, Identifiable {
    let id: String
    let name: String
    let tags: [String]
    let file: String
}
