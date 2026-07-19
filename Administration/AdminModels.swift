import Foundation

struct AdminSessionUser: Codable, Equatable, Identifiable {
    let id: String
    let email: String
    let name: String
    let mustChangePassword: Bool

}

enum AdminPackStatus: String, Codable {
    case draft
    case published
    case archived

    var label: String {
        switch self {
        case .draft: return "Rascunho"
        case .published: return "Publicado"
        case .archived: return "Arquivado"
        }
    }
}

struct AdminPack: Codable, Equatable, Identifiable {
    let id: String
    let slug: String
    let name: String
    let description: String
    let coverKey: String?
    let authorName: String
    let isFree: Bool
    let storeProductId: String?
    let status: AdminPackStatus
    let sortOrder: Int
    let createdAt: String
}

struct AdminCategory: Codable, Equatable, Identifiable {
    let id: String
    let packId: String
    let name: String
    let sortOrder: Int
}

struct AdminSticker: Codable, Equatable, Identifiable {
    let id: String
    let packId: String
    let categoryId: String
    let name: String
    let tags: [String]
    let fileKey: String
    let width: Int
    let height: Int
    let bytes: Int
    let sortOrder: Int
}

struct AdminPackDetail: Codable, Equatable, Identifiable {
    let id: String
    let slug: String
    let name: String
    let description: String
    let coverKey: String?
    let authorName: String
    let isFree: Bool
    let storeProductId: String?
    let status: AdminPackStatus
    let sortOrder: Int
    let createdAt: String
    let categories: [AdminCategory]
    let stickers: [AdminSticker]
}

struct InviteDetails: Codable, Equatable {
    let email: String
}

struct CatalogPublication: Codable, Equatable {
    let version: Int
    let url: String
    let checksum: String
}

struct OKResponse: Codable, Equatable {
    let ok: Bool
}

struct AccountDeletionResponse: Codable, Equatable {
    let ok: Bool
}
