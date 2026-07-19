import SwiftUI

struct SettingsRootView: View {
    @EnvironmentObject private var auth: AuthStore

    var body: some View {
        Group {
            if auth.phase == .signedIn, auth.user?.mustChangePassword == true {
                ChangePasswordView()
            } else {
                SettingsListView()
            }
        }
        .task { await auth.restoreSession() }
    }
}

private struct SettingsListView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var catalog: CatalogStore

    var body: some View {
        List {
            Section("Conteúdo") {
                Button {
                    Task { await catalog.refresh() }
                } label: {
                    HStack {
                        Label("Atualizar catálogo", systemImage: "arrow.triangle.2.circlepath")
                        Spacer()
                        RefreshStatusIcon(
                            isRefreshing: catalog.isRefreshing,
                            didJustUpdate: catalog.didJustUpdate
                        )
                    }
                    .contentShape(Rectangle())
                }
                .disabled(catalog.isRefreshing)
                .accessibilityIdentifier("settings-refresh")

                LabeledContent("Pacotes disponíveis", value: "\(catalog.packs.count)")

                if auth.isOwnerAdministrator {
                    NavigationLink {
                        AdminPacksView()
                    } label: {
                        Label("Pacotes e figurinhas", systemImage: "square.grid.2x2")
                    }
                    .accessibilityIdentifier("owner-content-management")
                }

                // Mensagens técnicas de catálogo são só para o administrador.
                // O usuário comum nunca vê aviso de "não publicado" ou falha de rede.
                if auth.isOwnerAdministrator, let message = catalog.refreshMessage {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.25), value: catalog.isRefreshing)
            .animation(.easeInOut(duration: 0.25), value: catalog.didJustUpdate)
            .animation(.easeInOut(duration: 0.25), value: catalog.refreshMessage)

            Section("Conta") {
                switch auth.phase {
                case .checking:
                    HStack {
                        ProgressView()
                        Text("Carregando…").foregroundStyle(.secondary)
                    }
                case .signedOut:
                    NavigationLink {
                        AccountLoginView()
                    } label: {
                        Label("Entrar na conta", systemImage: "person.crop.circle")
                    }
                    .accessibilityIdentifier("settings-login")
                case .signedIn:
                    NavigationLink {
                        AccountView()
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(auth.user?.name ?? "Conta")
                                .font(.headline)
                            if let email = auth.user?.email {
                                Text(email)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .accessibilityIdentifier("settings-account")
                }
            }

            Section("Aplicativo") {
                LabeledContent("Versão", value: appVersion)
            }
        }
        .navigationTitle("Configurações")
    }

    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
    }
}

/// Ícone de estado do botão de atualizar catálogo: giro enquanto atualiza,
/// um "check" verde discreto ao concluir e nada em repouso. As transições são
/// animadas pela seção que o contém.
private struct RefreshStatusIcon: View {
    let isRefreshing: Bool
    let didJustUpdate: Bool

    var body: some View {
        ZStack {
            if isRefreshing {
                ProgressView()
                    .transition(.opacity)
            } else if didJustUpdate {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .frame(width: 22, height: 22)
    }
}
