import SwiftUI

struct RootView: View {
    @EnvironmentObject private var catalog: CatalogStore
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @State private var showOnboarding = false
    @State private var pendingInvite: PendingInvite?

    var body: some View {
        TabView {
            NavigationStack {
                PacksListView()
            }
            .tabItem {
                Label("Pacotes", systemImage: "square.grid.2x2")
            }

            NavigationStack {
                FavoritesView()
            }
            .tabItem {
                Label("Favoritos", systemImage: "heart")
            }

            NavigationStack {
                SettingsRootView()
            }
            .tabItem {
                Label("Configurações", systemImage: "gearshape")
            }
        }
        .onAppear {
            showOnboarding = !hasCompletedOnboarding && pendingInvite == nil
        }
        .task { await catalog.refresh() }
        .onOpenURL(perform: openDeepLink)
        .fullScreenCover(isPresented: $showOnboarding) {
            OnboardingView {
                hasCompletedOnboarding = true
                showOnboarding = false
            }
        }
        .sheet(item: $pendingInvite) { invite in
            InviteAcceptanceView(token: invite.token) {
                pendingInvite = nil
            }
        }
    }

    private func openDeepLink(_ url: URL) {
        guard let token = DeepLinkParser.inviteToken(from: url) else { return }
        hasCompletedOnboarding = true
        showOnboarding = false
        pendingInvite = PendingInvite(token: token)
    }
}

private struct PendingInvite: Identifiable {
    let token: String
    var id: String { token }
}
