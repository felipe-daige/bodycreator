import SwiftUI

@main
struct FigurinhasApp: App {
    @StateObject private var catalog = CatalogStore(loader: .bundled, remote: .live)
    @StateObject private var favorites = FavoritesStore()
    @StateObject private var auth = AuthStore(service: .live)
    @StateObject private var purchases = PurchaseStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(catalog)
                .environmentObject(favorites)
                .environmentObject(auth)
                .environmentObject(purchases)
        }
    }
}
