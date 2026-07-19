import Foundation
import StoreKit

struct StoreProductInfo: Equatable, Identifiable {
    let id: String
    let displayName: String
    let description: String
    let displayPrice: String
}

struct StoreEntitlement {
    let transactionID: UInt64
    let productID: String
    let signedTransaction: String
    let isRevoked: Bool
    let finish: () async -> Void
}

enum StorePurchaseOutcome {
    case purchased(StoreEntitlement)
    case pending
    case cancelled
}

enum StoreServiceError: LocalizedError {
    case productUnavailable
    case failedVerification

    var errorDescription: String? {
        switch self {
        case .productUnavailable:
            return "Este pacote não está disponível para compra agora."
        case .failedVerification:
            return "A App Store não conseguiu confirmar a compra."
        }
    }
}

struct StoreService {
    let products: ([String]) async throws -> [StoreProductInfo]
    let purchase: (String) async throws -> StorePurchaseOutcome
    let currentEntitlements: () async -> [StoreEntitlement]
    let updates: () -> AsyncStream<StoreEntitlement>
    let sync: () async throws -> Void

    static let live = StoreService(
        products: { identifiers in
            try await Product.products(for: identifiers).map {
                StoreProductInfo(
                    id: $0.id,
                    displayName: $0.displayName,
                    description: $0.description,
                    displayPrice: $0.displayPrice
                )
            }
        },
        purchase: { productID in
            guard let product = try await Product.products(for: [productID]).first else {
                throw StoreServiceError.productUnavailable
            }
            switch try await product.purchase() {
            case let .success(result):
                return .purchased(try storeEntitlement(from: result))
            case .pending:
                return .pending
            case .userCancelled:
                return .cancelled
            @unknown default:
                return .cancelled
            }
        },
        currentEntitlements: {
            var entitlements: [StoreEntitlement] = []
            for await result in Transaction.currentEntitlements {
                if let entitlement = try? storeEntitlement(from: result) {
                    entitlements.append(entitlement)
                }
            }
            return entitlements
        },
        updates: {
            AsyncStream { continuation in
                let task = Task {
                    for await result in Transaction.updates {
                        if let entitlement = try? storeEntitlement(from: result) {
                            continuation.yield(entitlement)
                        }
                    }
                    continuation.finish()
                }
                continuation.onTermination = { _ in task.cancel() }
            }
        },
        sync: { try await AppStore.sync() }
    )
}

private func storeEntitlement(
    from result: VerificationResult<Transaction>
) throws -> StoreEntitlement {
    let signedTransaction = result.jwsRepresentation
    guard case let .verified(transaction) = result else {
        throw StoreServiceError.failedVerification
    }
    return StoreEntitlement(
        transactionID: transaction.id,
        productID: transaction.productID,
        signedTransaction: signedTransaction,
        isRevoked: transaction.revocationDate != nil,
        finish: { await transaction.finish() }
    )
}
