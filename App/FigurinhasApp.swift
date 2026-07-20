import SwiftUI

@main
struct FigurinhasApp: App {
    // UITEST_BUNDLED_ONLY deixa o app hermético nos testes de UI: sem catálogo
    // remoto (nem rede nem cache em disco), só o conteúdo embutido — assim os
    // testes não dependem do que está publicado no servidor.
    @StateObject private var catalog = CatalogStore(
        loader: .bundled,
        remote: ProcessInfo.processInfo.environment["UITEST_BUNDLED_ONLY"] == "1" ? nil : .live
    )
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
