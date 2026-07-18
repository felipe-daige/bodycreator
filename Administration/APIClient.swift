import Foundation

enum APIError: LocalizedError, Equatable {
    case invalidURL
    case invalidResponse
    case transport(String)
    case server(status: Int, message: String)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "O endereço do servidor não está configurado corretamente."
        case .invalidResponse:
            return "O servidor devolveu uma resposta inválida."
        case let .transport(message):
            return message
        case let .server(_, message):
            return message
        case .decoding:
            return "Não foi possível interpretar a resposta do servidor."
        }
    }

    var isUnauthorized: Bool {
        if case .server(status: 401, message: _) = self { return true }
        return false
    }
}

struct MultipartFile {
    let fieldName: String
    let fileName: String
    let mimeType: String
    let data: Data
}

struct APIClient {
    let baseURL: URL
    let session: URLSession

    static var live: APIClient {
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = .shared
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpShouldSetCookies = true
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return APIClient(
            baseURL: AppConfiguration.apiBaseURL,
            session: URLSession(configuration: configuration)
        )
    }

    func get<Response: Decodable>(
        _ path: String,
        queryItems: [URLQueryItem] = []
    ) async throws -> Response {
        try await request(path, method: "GET", queryItems: queryItems)
    }

    func post<Response: Decodable, Body: Encodable>(
        _ path: String,
        body: Body
    ) async throws -> Response {
        try await request(path, method: "POST", body: try encode(body))
    }

    func post<Response: Decodable>(_ path: String) async throws -> Response {
        try await request(path, method: "POST")
    }

    func patch<Response: Decodable, Body: Encodable>(
        _ path: String,
        body: Body
    ) async throws -> Response {
        try await request(path, method: "PATCH", body: try encode(body))
    }

    func delete<Response: Decodable, Body: Encodable>(
        _ path: String,
        body: Body
    ) async throws -> Response {
        try await request(path, method: "DELETE", body: try encode(body))
    }

    func delete<Response: Decodable>(_ path: String) async throws -> Response {
        try await request(path, method: "DELETE")
    }

    func upload<Response: Decodable>(
        _ path: String,
        fields: [(String, String)],
        file: MultipartFile
    ) async throws -> Response {
        let boundary = "BodyCreator-\(UUID().uuidString)"
        let body = Self.multipartBody(fields: fields, file: file, boundary: boundary)
        return try await request(
            path,
            method: "POST",
            body: body,
            contentType: "multipart/form-data; boundary=\(boundary)"
        )
    }

    private func request<Response: Decodable>(
        _ path: String,
        method: String,
        queryItems: [URLQueryItem] = [],
        body: Data? = nil,
        contentType: String = "application/json"
    ) async throws -> Response {
        guard var components = URLComponents(
            url: path.split(separator: "/").reduce(baseURL) {
                $0.appendingPathComponent(String($1))
            },
            resolvingAgainstBaseURL: false
        ) else {
            throw APIError.invalidURL
        }
        if !queryItems.isEmpty { components.queryItems = queryItems }
        guard let url = components.url else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(
                "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente."
            )
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let envelope = try? JSONDecoder().decode(ErrorEnvelope.self, from: data)
            throw APIError.server(
                status: http.statusCode,
                message: envelope?.error ?? envelope?.message ?? "Algo deu errado. Tente de novo."
            )
        }

        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }

    private func encode<Body: Encodable>(_ body: Body) throws -> Data {
        do {
            return try JSONEncoder().encode(body)
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }

    static func multipartBody(
        fields: [(String, String)],
        file: MultipartFile,
        boundary: String
    ) -> Data {
        var body = Data()
        let lineBreak = "\r\n"

        func append(_ string: String) {
            body.append(Data(string.utf8))
        }

        for (name, value) in fields {
            append("--\(boundary)\(lineBreak)")
            append("Content-Disposition: form-data; name=\"\(escaped(name))\"\(lineBreak)\(lineBreak)")
            append(value)
            append(lineBreak)
        }

        append("--\(boundary)\(lineBreak)")
        append(
            "Content-Disposition: form-data; name=\"\(escaped(file.fieldName))\"; " +
            "filename=\"\(escaped(file.fileName))\"\(lineBreak)"
        )
        append("Content-Type: \(file.mimeType)\(lineBreak)\(lineBreak)")
        body.append(file.data) // bytes do PNG entram exatamente como foram escolhidos
        append(lineBreak)
        append("--\(boundary)--\(lineBreak)")
        return body
    }

    private static func escaped(_ value: String) -> String {
        value.replacingOccurrences(of: "\\", with: "_")
            .replacingOccurrences(of: "\"", with: "_")
            .replacingOccurrences(of: "\r", with: "_")
            .replacingOccurrences(of: "\n", with: "_")
    }
}

private struct ErrorEnvelope: Decodable {
    let error: String?
    let message: String?
}
