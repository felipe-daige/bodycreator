import Foundation

struct StickerManifest: Codable, Equatable {
    let version: Int
    var packs: [StickerPack]
}

struct StickerPack: Codable, Equatable, Hashable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let cover: String
    let free: Bool
    let productID: String?
    var categories: [StickerCategory]

    var allStickers: [Sticker] { categories.flatMap(\.stickers) }

    private enum CodingKeys: String, CodingKey {
        case id, name, description, cover, free, categories
        case productID = "productId"
    }
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
