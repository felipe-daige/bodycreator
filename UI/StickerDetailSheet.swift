import SwiftUI
import PhotosUI
import UIKit

struct StickerDetailSheet: View {
    let sticker: Sticker
    let imageURL: URL

    @EnvironmentObject private var favorites: FavoritesStore
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @State private var pickedPhoto: PhotosPickerItem?
    @State private var isPreparingPhoto = false
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
                .frame(height: 220)
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

                PhotosPicker(selection: $pickedPhoto, matching: .images, photoLibrary: .shared()) {
                    Label(
                        isPreparingPhoto ? "Preparando…" : "Usar no Instagram",
                        systemImage: "photo.on.rectangle.angled"
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(isPreparingPhoto)
                .accessibilityIdentifier("use-in-instagram")

                Text("Escolha uma foto já tirada do paciente. O Instagram abre com a foto de fundo e a figurinha por cima, pronta para você arrastar e posicionar.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                Button {
                    handle(exporter.copyOnly(imageAt: imageURL))
                } label: {
                    Label("Só copiar a figurinha", systemImage: "doc.on.clipboard")
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
        .onChange(of: pickedPhoto) { item in
            guard let item else { return }
            prepareAndShare(item)
        }
        .alert(
            "Instale o Instagram para usar as figurinhas",
            isPresented: $showInstagramMissingAlert
        ) {
            Button("Ver na App Store") {
                openURL(StickerExporter.instagramAppStoreURL)
            }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Você também pode usar \u{201C}Só copiar a figurinha\u{201D} e colar em outros apps, como o WhatsApp.")
        }
    }

    private func prepareAndShare(_ item: PhotosPickerItem) {
        isPreparingPhoto = true
        Task {
            defer {
                isPreparingPhoto = false
                pickedPhoto = nil
            }
            guard
                let data = try? await item.loadTransferable(type: Data.self),
                let jpeg = UIImage(data: data)?.jpegData(compressionQuality: 0.9)
            else {
                handle(.copyFailed)
                return
            }
            handle(exporter.shareToInstagramStories(
                stickerAt: imageURL,
                backgroundImage: jpeg,
                facebookAppID: InstagramSharing.facebookAppID
            ))
        }
    }

    private func handle(_ outcome: ExportOutcome) {
        switch outcome {
        case .openedInstagramStories:
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            withAnimation {
                statusMessage = "No Instagram, arraste a figurinha para posicionar sobre a foto e publique."
            }
        case .copiedOnly:
            confirmCopied(nextStep: "Agora é só colar onde quiser: toque e segure e escolha Colar.")
        case .instagramNotInstalled:
            notifyFailure()
            showInstagramMissingAlert = true
        case .missingFacebookAppID:
            notifyFailure()
            withAnimation {
                statusMessage = "Integração com o Instagram ainda não configurada (Facebook App ID)."
            }
        case .copyFailed:
            notifyFailure()
            withAnimation { statusMessage = "Não foi possível preparar a figurinha. Tente de novo." }
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
