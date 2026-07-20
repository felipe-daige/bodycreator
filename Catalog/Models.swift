import Foundation

struct StickerManifest: Codable, Equatable {
    let version: Int
    var storefront: Storefront?
    var packs: [StickerPack]
}

struct Storefront: Codable, Equatable, Hashable {
    let hero: String?
    let sections: [StorefrontSection]
}

struct StorefrontSection: Codable, Equatable, Hashable, Identifiable {
    let id: String
    let title: String
    let packs: [String]
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
