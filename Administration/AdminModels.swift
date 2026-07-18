import Foundation

enum AdminRole: String, Codable, CaseIterable, Identifiable {
    case admin
    case manager = "gerente"

    var id: String { rawValue }
    var label: String { self == .admin ? "Administrador" : "Gerente" }
}

enum AdminPermission: String, Codable, CaseIterable, Identifiable {
    case importSticker = "sticker.import"
    case createPack = "pack.create"
    case editPack = "pack.edit"
    case publishPack = "pack.publish"
    case setPrice = "pack.price"
    case viewReports = "report.view"
    case manageUsers = "user.manage"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .importSticker: return "Importar figurinhas"
        case .createPack: return "Criar pacotes"
        case .editPack: return "Editar pacotes"
        case .publishPack: return "Publicar o catálogo"
        case .setPrice: return "Definir preços"
        case .viewReports: return "Ver faturamento"
        case .manageUsers: return "Gerenciar usuários"
        }
    }

    var isAdminOnly: Bool { self == .manageUsers }
    var isAvailableNow: Bool { self != .setPrice && self != .viewReports }
}

struct AdminSessionUser: Codable, Equatable, Identifiable {
    let id: String
    let email: String
    let name: String
    let role: AdminRole
    let permissions: [String]
    let mustChangePassword: Bool

    func can(_ permission: AdminPermission) -> Bool {
        if role == .admin { return true }
        if permission.isAdminOnly { return false }
        return permissions.contains(permission.rawValue)
    }
}

enum ManagedUserStatus: String, Codable {
    case invited
    case active
    case disabled

    var label: String {
        switch self {
        case .invited: return "Convidado"
        case .active: return "Ativo"
        case .disabled: return "Desativado"
        }
    }
}

struct ManagedUser: Codable, Equatable, Identifiable {
    let id: String
    let email: String
    let name: String
    let role: AdminRole
    let permissions: [String]
    let status: ManagedUserStatus
    let createdAt: String
    let lastLoginAt: String?
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
    let status: AdminPackStatus
    let sortOrder: Int
    let createdAt: String
    let categories: [AdminCategory]
    let stickers: [AdminSticker]
}

struct InviteSummary: Codable, Equatable {
    let id: String
    let email: String
    let expiresAt: String
}

struct InviteDetails: Codable, Equatable {
    let email: String
    let role: AdminRole
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
