import Foundation

@MainActor
final class AuthStore: ObservableObject {
    enum Phase: Equatable {
        case checking
        case signedOut
        case signedIn
    }

    @Published private(set) var phase: Phase = .checking
    @Published private(set) var user: AdminSessionUser?
    @Published private(set) var connectionMessage: String?

    let service: AdminService
    private var didRestore = false

    init(service: AdminService) {
        self.service = service
    }

    func restoreSession() async {
        guard !didRestore else { return }
        didRestore = true
        do {
            user = try await service.currentUser()
            phase = .signedIn
            connectionMessage = nil
        } catch let error as APIError {
            user = nil
            phase = .signedOut
            connectionMessage = error.isUnauthorized ? nil : error.localizedDescription
        } catch {
            user = nil
            phase = .signedOut
            connectionMessage = "Não foi possível verificar a sessão."
        }
    }

    func login(email: String, password: String) async throws {
        let loggedIn = try await service.login(
            email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            password: password
        )
        user = loggedIn
        phase = .signedIn
        connectionMessage = nil
    }

    func refreshUser() async throws {
        user = try await service.currentUser()
        phase = .signedIn
    }

    func logout() async {
        try? await service.logout()
        user = nil
        phase = .signedOut
    }

    func deleteAccount(currentPassword: String) async throws {
        try await service.deleteAccount(currentPassword: currentPassword)
        user = nil
        phase = .signedOut
    }

    func consume(_ error: Error) {
        guard let apiError = error as? APIError, apiError.isUnauthorized else { return }
        user = nil
        phase = .signedOut
    }

    var isOwnerAdministrator: Bool {
        OwnerAccess.isAdministrator(user?.email)
    }
}
