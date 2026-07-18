import SwiftUI

@main
struct FigurinhasApp: App {
    @StateObject private var catalog = CatalogStore(loader: .bundled)
    @StateObject private var favorites = FavoritesStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(catalog)
                .environmentObject(favorites)
        }
    }
}
