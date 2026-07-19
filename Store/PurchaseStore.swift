import Foundation

@MainActor
final class PurchaseStore: ObservableObject {
    @Published private(set) var products: [String: StoreProductInfo] = [:]
    @Published private(set) var purchasedProductIDs: Set<String> = []
    @Published private(set) var accessTokens: [String: String] = [:]
    @Published private(set) var isLoading = false
    @Published private(set) var purchasingProductID: String?
    @Published private(set) var isRestoring = false
    @Published private(set) var loadMessage: String?
    @Published var alertMessage: String?

    private let service: StoreService
    private let validation: StoreValidationClient
    private var knownProductIDs: Set<String> = []
    private var accessTokenExpirations: [String: Date] = [:]
    private var updatesTask: Task<Void, Never>?
    private var renewalTask: Task<Void, Never>?

    init(service: StoreService, validation: StoreValidationClient) {
        self.service = service
        self.validation = validation
        updatesTask = Task { [weak self, service] in
            for await entitlement in service.updates() {
                guard let self else { return }
                await self.accept(entitlement, reportsFailure: true)
            }
        }
    }

    convenience init() {
        self.init(service: .live, validation: .live)
    }

    deinit {
        updatesTask?.cancel()
        renewalTask?.cancel()
    }

    func load(packs: [StickerPack]) async {
        let identifiers = Set(packs.compactMap { pack in
            pack.free ? nil : pack.productID
        })
        knownProductIDs = identifiers
        isLoading = true
        loadMessage = nil
        defer { isLoading = false }

        do {
            products = Dictionary(
                uniqueKeysWithValues: try await service.products(identifiers.sorted()).map {
                    ($0.id, $0)
                }
            )
            if products.count != identifiers.count, !identifiers.isEmpty {
                loadMessage = "Alguns pacotes ainda não estão disponíveis na App Store."
            }
        } catch {
            products = [:]
            if !identifiers.isEmpty {
                loadMessage = "Não foi possível consultar os preços da App Store."
            }
        }
        await refreshEntitlements(reportsFailure: false)
    }

    func product(for pack: StickerPack) -> StoreProductInfo? {
        pack.productID.flatMap { products[$0] }
    }

    func hasAccess(to pack: StickerPack) -> Bool {
        if pack.free { return true }
        guard let productID = pack.productID else { return false }
        return purchasedProductIDs.contains(productID)
    }

    func accessToken(for pack: StickerPack?) -> String? {
        guard let productID = pack?.productID else { return nil }
        guard let expiration = accessTokenExpirations[productID], expiration > Date() else {
            return nil
        }
        return accessTokens[productID]
    }

    func purchase(_ pack: StickerPack) async {
        guard let productID = pack.productID, products[productID] != nil else {
            alertMessage = "Este pacote não está disponível para compra agora."
            return
        }
        purchasingProductID = productID
        defer { purchasingProductID = nil }

        do {
            switch try await service.purchase(productID) {
            case let .purchased(entitlement):
                await accept(entitlement, reportsFailure: true)
                if accessTokens[productID] != nil {
                    alertMessage = "Compra concluída. O pacote já está na sua biblioteca."
                }
            case .pending:
                alertMessage = "A compra está aguardando aprovação. O pacote será liberado automaticamente depois."
            case .cancelled:
                break
            }
        } catch {
            alertMessage = error.localizedDescription
        }
    }

    func restore() async {
        isRestoring = true
        defer { isRestoring = false }
        do {
            try await service.sync()
            await refreshEntitlements(reportsFailure: true)
            alertMessage = purchasedProductIDs.isEmpty
                ? "Nenhuma compra anterior foi encontrada."
                : "Compras restauradas. Seus pacotes já estão na biblioteca."
        } catch {
            alertMessage = "Não foi possível restaurar as compras. Tente novamente."
        }
    }

    private func refreshEntitlements(reportsFailure: Bool) async {
        let entitlements = await service.currentEntitlements()
        let active = Set(entitlements.filter { !$0.isRevoked }.map(\.productID))
        let now = Date()
        let productsWithValidTokens = Set(accessTokenExpirations.compactMap { productID, date in
            active.contains(productID) && date > now ? productID : nil
        })
        purchasedProductIDs = active
        accessTokens = accessTokens.filter { productsWithValidTokens.contains($0.key) }
        accessTokenExpirations = accessTokenExpirations.filter {
            productsWithValidTokens.contains($0.key)
        }
        for entitlement in entitlements where knownProductIDs.contains(entitlement.productID) {
            await accept(entitlement, reportsFailure: reportsFailure)
        }
        scheduleRenewal()
    }

    private func accept(_ entitlement: StoreEntitlement, reportsFailure: Bool) async {
        if entitlement.isRevoked {
            purchasedProductIDs.remove(entitlement.productID)
            accessTokens.removeValue(forKey: entitlement.productID)
            accessTokenExpirations.removeValue(forKey: entitlement.productID)
            scheduleRenewal()
            await entitlement.finish()
            return
        }

        purchasedProductIDs.insert(entitlement.productID)
        do {
            let result = try await validation.validate(entitlement.signedTransaction)
            guard result.productId == entitlement.productID else {
                throw StoreValidationError.invalidResponse
            }
            accessTokens[entitlement.productID] = result.accessToken
            accessTokenExpirations[entitlement.productID] = Date(
                timeIntervalSince1970: TimeInterval(result.expiresAt)
            )
            scheduleRenewal()
            await entitlement.finish()
        } catch {
            if reportsFailure { alertMessage = error.localizedDescription }
        }
    }

    private func scheduleRenewal() {
        renewalTask?.cancel()
        guard let expiration = accessTokenExpirations.values.min() else {
            renewalTask = nil
            return
        }

        // Renova cinco minutos antes do vencimento. Se o app estiver suspenso,
        // a tarefa continua assim que ele voltar ao primeiro plano.
        let delay = max(expiration.timeIntervalSinceNow - 5 * 60, 60)
        renewalTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            await self.refreshEntitlements(reportsFailure: false)
        }
    }
}
