import Foundation

enum DeepLinkParser {
    static func inviteToken(from url: URL) -> String? {
        let isCustomInvite = url.scheme?.lowercased() == "bodycreator" &&
            url.host?.lowercased() == "convite"
        let isWebInvite = ["http", "https"].contains(url.scheme?.lowercased() ?? "") &&
            url.pathComponents.last?.lowercased() == "convite"
        guard isCustomInvite || isWebInvite,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let token = components.queryItems?.first(where: { $0.name == "token" })?.value,
              token.count >= 32 else {
            return nil
        }
        return token
    }
}
