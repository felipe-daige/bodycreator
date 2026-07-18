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
                        Label("Atualizar catálogo", systemImage: "arrow.clockwise")
                        Spacer()
                        if catalog.isRefreshing { ProgressView() }
                    }
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

                if let message = catalog.refreshMessage {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

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
