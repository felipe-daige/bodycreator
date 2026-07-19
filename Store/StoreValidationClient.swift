import Foundation

struct StoreValidationResult: Decodable, Equatable {
    let productId: String
    let accessToken: String
    let expiresAt: Int
}

enum StoreValidationError: LocalizedError {
    case invalidResponse
    case server(String)
    case transport

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "O servidor devolveu uma confirmação de compra inválida."
        case let .server(message):
            return message
        case .transport:
            return "A compra foi aprovada, mas não foi possível liberar o download agora. Tente restaurar as compras quando estiver conectado."
        }
    }
}

struct StoreValidationClient {
    let validate: (String) async throws -> StoreValidationResult

    static let live = StoreValidationClient { signedTransaction in
        let url = AppConfiguration.apiBaseURL
            .appendingPathComponent("store")
            .appendingPathComponent("transactions")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONEncoder().encode(
            StoreTransactionRequest(signedTransaction: signedTransaction)
        )

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw StoreValidationError.transport
        }
        guard let http = response as? HTTPURLResponse else {
            throw StoreValidationError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let envelope = try? JSONDecoder().decode(StoreErrorEnvelope.self, from: data)
            throw StoreValidationError.server(
                envelope?.error ?? "A compra não pôde ser confirmada pelo servidor."
            )
        }
        guard let result = try? JSONDecoder().decode(StoreValidationResult.self, from: data) else {
            throw StoreValidationError.invalidResponse
        }
        return result
    }
}

private struct StoreTransactionRequest: Encodable {
    let signedTransaction: String
}

private struct StoreErrorEnvelope: Decodable {
    let error: String
}
