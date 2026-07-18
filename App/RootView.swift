import SwiftUI

struct RootView: View {
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @State private var showOnboarding = false

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
        }
        .onAppear {
            showOnboarding = !hasCompletedOnboarding
        }
        .fullScreenCover(isPresented: $showOnboarding) {
            OnboardingView {
                hasCompletedOnboarding = true
                showOnboarding = false
            }
        }
    }
}
