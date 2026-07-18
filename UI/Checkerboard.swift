import SwiftUI

/// Fundo xadrez para deixar visível o canal transparente da figurinha.
struct Checkerboard: View {
    private let squareSize: CGFloat = 12

    var body: some View {
        Canvas { context, size in
            context.fill(
                Path(CGRect(origin: .zero, size: size)),
                with: .color(Color(.systemBackground))
            )

            let rowCount = Int(ceil(size.height / squareSize))
            let columnCount = Int(ceil(size.width / squareSize))

            for row in 0..<rowCount {
                for column in 0..<columnCount where (row + column).isMultiple(of: 2) {
                    let rectangle = CGRect(
                        x: CGFloat(column) * squareSize,
                        y: CGFloat(row) * squareSize,
                        width: squareSize,
                        height: squareSize
                    )
                    context.fill(Path(rectangle), with: .color(Color(.systemGray5)))
                }
            }
        }
        .accessibilityHidden(true)
    }
}
