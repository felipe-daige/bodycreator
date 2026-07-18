import Foundation

enum AppConfiguration {
    static var apiBaseURL: URL {
        if let override = ProcessInfo.processInfo.environment["BODYCREATOR_API_URL"],
           let url = URL(string: override), !override.isEmpty {
            return url
        }

        if let configured = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
           let url = URL(string: configured),
           !configured.contains("$(") {
            return url
        }

        // Fallback seguro para builds de desenvolvimento gerados fora do XcodeGen.
        return URL(string: "http://127.0.0.1:3000")!
    }
}
