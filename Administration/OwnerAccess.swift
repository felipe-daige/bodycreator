import Foundation

enum OwnerAccess {
    static let administratorEmail = "felipedaige@gmail.com"

    static func isAdministrator(_ email: String?) -> Bool {
        email?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == administratorEmail
    }
}
