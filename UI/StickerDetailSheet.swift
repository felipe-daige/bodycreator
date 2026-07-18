import SwiftUI
import UIKit

struct StickerDetailSheet: View {
    let sticker: Sticker
    let imageURL: URL

    @EnvironmentObject private var favorites: FavoritesStore
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @State private var statusMessage: String?
    @State private var showCopiedToast = false
    @State private var showInstagramMissingAlert = false

    private let exporter = StickerExporter()

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                ZStack {
                    Checkerboard()
                    StickerImageView(url: imageURL)
                        .padding(24)
                }
                .frame(height: 240)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(alignment: .topTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.body.weight(.semibold))
                            .frame(width: 36, height: 36)
                            .background(.regularMaterial, in: Circle())
                    }
                    .foregroundStyle(.primary)
                    .padding(8)
                    .accessibilityLabel("Fechar")
                    .accessibilityIdentifier("close-sticker-detail")
                }

                HStack(spacing: 12) {
                    Text(sticker.name)
                        .font(.headline)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Button {
                        favorites.toggle(sticker.id)
                    } label: {
                        Image(systemName: favorites.isFavorite(sticker.id) ? "heart.fill" : "heart")
                            .font(.title2)
                            .foregroundStyle(.pink)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel(
                        favorites.isFavorite(sticker.id)
                            ? "Remover dos favoritos"
                            : "Adicionar aos favoritos"
                    )
                    .accessibilityIdentifier("favorite-toggle")
                }

                Button {
                    handle(exporter.copyAndOpenInstagram(imageAt: imageURL))
                } label: {
                    Label("Copiar e abrir Instagram", systemImage: "camera")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .accessibilityIdentifier("copy-and-open-instagram")

                Button {
                    handle(exporter.copyOnly(imageAt: imageURL))
                } label: {
                    Label("Só copiar", systemImage: "doc.on.clipboard")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .accessibilityIdentifier("copy-only")

                if let statusMessage {
                    Text(statusMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .transition(.opacity)
                }
            }
            .padding()
        }
        .overlay(alignment: .top) {
            if showCopiedToast {
                Label("Copiado!", systemImage: "checkmark.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 11)
                    .background(Color.green, in: Capsule())
                    .padding(.top, 10)
                    .shadow(radius: 8, y: 2)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .accessibilityIdentifier("copied-toast")
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .alert(
            "Instale o Instagram para usar as figurinhas",
            isPresented: $showInstagramMissingAlert
        ) {
            Button("Ver na App Store") {
                openURL(StickerExporter.instagramAppStoreURL)
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("A figurinha já foi copiada. Você também pode colar em outros apps, como o WhatsApp.")
        }
    }

    private func handle(_ outcome: ExportOutcome) {
        switch outcome {
        case .copiedAndOpenedInstagram:
            confirmCopied(nextStep: "No story, toque e segure na tela e escolha Colar para trazer a figurinha.")
        case .copiedOnly:
            confirmCopied(nextStep: "Agora é só colar onde quiser: toque e segure e escolha Colar.")
        case .instagramNotInstalled:
            notifyFailure()
            showInstagramMissingAlert = true
        case .copyFailed:
            notifyFailure()
            withAnimation { statusMessage = "Não foi possível copiar. Tente de novo." }
        }
    }

    private func confirmCopied(nextStep: String) {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        withAnimation {
            statusMessage = nextStep
            showCopiedToast = true
        }
        Task {
            try? await Task.sleep(nanoseconds: 1_700_000_000)
            withAnimation { showCopiedToast = false }
        }
    }

    private func notifyFailure() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}
