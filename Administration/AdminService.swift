import Foundation

struct AdminService {
    let api: APIClient

    static let live = AdminService(api: .live)

    func login(email: String, password: String) async throws -> AdminSessionUser {
        try await api.post("auth/login", body: LoginBody(email: email, password: password))
    }

    func currentUser() async throws -> AdminSessionUser {
        try await api.get("auth/me")
    }

    func logout() async throws {
        let _: OKResponse = try await api.post("auth/logout")
    }

    func changePassword(current: String, new: String) async throws {
        let _: OKResponse = try await api.post(
            "auth/change-password",
            body: ChangePasswordBody(currentPassword: current, newPassword: new)
        )
    }

    func deleteAccount(currentPassword: String) async throws {
        let _: AccountDeletionResponse = try await api.delete(
            "auth/account",
            body: DeleteAccountBody(currentPassword: currentPassword)
        )
    }

    func inviteDetails(token: String) async throws -> InviteDetails {
        try await api.get("invites/accept", queryItems: [URLQueryItem(name: "token", value: token)])
    }

    func acceptInvite(token: String, name: String, password: String) async throws {
        let _: AcceptedInvite = try await api.post(
            "invites/accept",
            body: AcceptInviteBody(token: token, name: name, password: password)
        )
    }

    func packs() async throws -> [AdminPack] { try await api.get("packs") }
    func pack(id: String) async throws -> AdminPackDetail { try await api.get("packs/\(id)") }

    func createPack(slug: String, name: String, author: String, description: String) async throws -> AdminPack {
        try await api.post(
            "packs",
            body: CreatePackBody(slug: slug, name: name, description: description, authorName: author)
        )
    }

    func updatePack(id: String, name: String, description: String, sortOrder: Int) async throws {
        let _: OKResponse = try await api.patch(
            "packs/\(id)",
            body: UpdatePackBody(name: name, description: description, sortOrder: sortOrder)
        )
    }

    func createCategory(packID: String, name: String) async throws -> AdminCategory {
        try await api.post("packs/\(packID)/categories", body: CreateCategoryBody(name: name))
    }

    func uploadCover(packID: String, png: Data, fileName: String) async throws {
        let _: CoverResponse = try await api.upload(
            "packs/\(packID)/cover",
            fields: [],
            file: MultipartFile(fieldName: "file", fileName: fileName, mimeType: "image/png", data: png)
        )
    }

    func uploadSticker(
        packID: String,
        categoryID: String,
        id: String,
        name: String,
        tags: [String],
        png: Data,
        fileName: String
    ) async throws -> AdminSticker {
        let tagsData = try JSONEncoder().encode(tags)
        let tagsJSON = String(data: tagsData, encoding: .utf8) ?? "[]"
        return try await api.upload(
            "packs/\(packID)/stickers",
            fields: [("id", id), ("name", name), ("categoryId", categoryID), ("tags", tagsJSON)],
            file: MultipartFile(fieldName: "file", fileName: fileName, mimeType: "image/png", data: png)
        )
    }

    func deleteSticker(id: String) async throws {
        let _: OKResponse = try await api.delete("stickers/\(id)")
    }

    func setPackPublished(id: String, published: Bool) async throws {
        let _: PackStatusResponse = try await api.post("packs/\(id)/\(published ? "publish" : "unpublish")")
    }

    func publishCatalog() async throws -> CatalogPublication { try await api.post("publish") }
}

private struct LoginBody: Encodable { let email: String; let password: String }
private struct ChangePasswordBody: Encodable { let currentPassword: String; let newPassword: String }
private struct DeleteAccountBody: Encodable { let currentPassword: String }
private struct AcceptInviteBody: Encodable { let token: String; let name: String; let password: String }
private struct CreatePackBody: Encodable { let slug: String; let name: String; let description: String; let authorName: String }
private struct UpdatePackBody: Encodable { let name: String; let description: String; let sortOrder: Int }
private struct CreateCategoryBody: Encodable { let name: String }
private struct AcceptedInvite: Decodable { let id: String; let email: String }
private struct CoverResponse: Decodable { let ok: Bool; let coverKey: String }
private struct PackStatusResponse: Decodable { let ok: Bool; let status: AdminPackStatus }
