import SwiftUI

struct AdminRootView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        Group {
            switch auth.phase {
            case .checking:
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Verificando acesso…")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .signedOut:
                AdminLoginView()
            case .signedIn:
                if auth.user?.mustChangePassword == true {
                    ChangePasswordView()
                } else {
                    AdminDashboardView()
                }
            }
        }
        .task { await auth.restoreSession() }
    }
}

private struct AdminDashboardView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        List {
            if let user = auth.user {
                Section {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(user.name).font(.headline)
                        Text(user.email)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text(user.role.label)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Color.accentColor)
                    }
                    .padding(.vertical, 4)
                }
            }

            Section("Administração") {
                NavigationLink {
                    AdminPacksView()
                } label: {
                    Label("Pacotes e figurinhas", systemImage: "square.grid.2x2")
                }
                .accessibilityIdentifier("admin-packs")

                if auth.can(.manageUsers) {
                    NavigationLink {
                        ManagedUsersView()
                    } label: {
                        Label("Usuários e permissões", systemImage: "person.2")
                    }
                    .accessibilityIdentifier("admin-users")
                }
            }

            Section {
                NavigationLink {
                    AdminAccountView()
                } label: {
                    Label("Conta administrativa", systemImage: "person.crop.circle")
                }
            }
        }
        .navigationTitle("Gerenciar")
    }
}
