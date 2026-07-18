import Foundation

struct SelectedPNG: Equatable {
    let data: Data
    let fileName: String

    static func read(from url: URL) throws -> SelectedPNG {
        let hasAccess = url.startAccessingSecurityScopedResource()
        defer { if hasAccess { url.stopAccessingSecurityScopedResource() } }

        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        let pngSignature = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        guard data.starts(with: pngSignature) else {
            throw SelectedPNGError.notPNG
        }
        guard data.count <= 2 * 1024 * 1024 else {
            throw SelectedPNGError.tooLarge
        }
        return SelectedPNG(data: data, fileName: url.lastPathComponent)
    }
}

enum SelectedPNGError: LocalizedError {
    case notPNG
    case tooLarge

    var errorDescription: String? {
        switch self {
        case .notPNG: return "Escolha um arquivo PNG válido."
        case .tooLarge: return "O arquivo passa do tamanho máximo permitido (2 MB)."
        }
    }
}
