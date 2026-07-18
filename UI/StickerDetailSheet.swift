import SwiftUI
import PhotosUI
import AVFoundation
import UIKit

struct StickerDetailSheet: View {
    let sticker: Sticker
    let imageURL: URL

    @EnvironmentObject private var favorites: FavoritesStore
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @State private var pickedPhoto: PhotosPickerItem?
    @State private var showPhotosPicker = false
    @State private var showCamera = false
    @State private var showCameraDeniedAlert = false
    @State private var isPreparingPhoto = false
    @State private var statusMessage: String?
    @State private var showCopiedToast = false
    @State private var showInstagramMissingAlert = false

    private let exporter = StickerExporter()

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Checkerboard()
                StickerImageView(url: imageURL)
                    .padding(16)
            }
            .frame(height: 150)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(alignment: .topTrailing) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.subheadline.weight(.semibold))
                        .frame(width: 32, height: 32)
                        .background(.regularMaterial, in: Circle())
                }
                .foregroundStyle(.primary)
                .padding(6)
                .accessibilityLabel("Fechar")
                .accessibilityIdentifier("close-sticker-detail")
            }

            HStack(spacing: 12) {
                Text(sticker.name)
                    .font(.headline)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Button {
                    favorites.toggle(sticker.id)
                } label: {
                    Image(systemName: favorites.isFavorite(sticker.id) ? "heart.fill" : "heart")
                        .font(.title3)
                        .foregroundStyle(.pink)
                        .frame(width: 40, height: 40)
                }
                .accessibilityLabel(
                    favorites.isFavorite(sticker.id)
                        ? "Remover dos favoritos"
                        : "Adicionar aos favoritos"
                )
                .accessibilityIdentifier("favorite-toggle")
            }

            HStack(spacing: 10) {
                Button {
                    startCamera()
                } label: {
                    Label("Tirar foto", systemImage: "camera.fill")
                        .frame(maxWidth: .infinity)
                }
                .accessibilityIdentifier("take-photo")

                Button {
                    showPhotosPicker = true
                } label: {
                    Label("Galeria", systemImage: "photo.on.rectangle.angled")
                        .frame(maxWidth: .infinity)
                }
                .accessibilityIdentifier("pick-from-gallery")
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(isPreparingPhoto)
            .alert("Acesso à câmera desativado", isPresented: $showCameraDeniedAlert) {
                Button("Abrir Ajustes") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        openURL(url)
                    }
                }
                Button("Agora não", role: .cancel) {}
            } message: {
                Text("Para tirar a foto aqui, ative a câmera em Ajustes › Body Creator › Câmera. Enquanto isso, você pode usar a opção Galeria.")
            }

            Button {
                handle(exporter.copyOnly(imageAt: imageURL))
            } label: {
                Label("Só copiar a figurinha", systemImage: "doc.on.clipboard")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.large)
            .accessibilityIdentifier("copy-only")

            Text(statusMessage ?? (isPreparingPhoto
                ? "Preparando…"
                : "Escolha a foto do paciente: o Instagram abre com ela de fundo e a figurinha por cima."))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity)

            Spacer(minLength: 0)
        }
        .padding(20)
        .overlay(alignment: .top) {
            if showCopiedToast {
                Label("Copiado!", systemImage: "checkmark.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 11)
                    .background(Color.green, in: Capsule())
                    .padding(.top, 8)
                    .shadow(radius: 8, y: 2)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .accessibilityIdentifier("copied-toast")
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .photosPicker(isPresented: $showPhotosPicker, selection: $pickedPhoto, matching: .images)
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                share(photo: image)
            }
            .ignoresSafeArea()
        }
        .onChange(of: pickedPhoto) { item in
            guard let item else { return }
            loadFromLibrary(item)
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

    /// Só apresenta a câmera com permissão concedida: sem isso o
    /// UIImagePickerController abre uma tela preta.
    private func startCamera() {
        guard CameraPicker.isAvailable else {
            showCameraDeniedAlert = true
            return
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            showCamera = true
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                Task { @MainActor in
                    if granted {
                        showCamera = true
                    } else {
                        showCameraDeniedAlert = true
                    }
                }
            }
        default:
            showCameraDeniedAlert = true
        }
    }

    private func loadFromLibrary(_ item: PhotosPickerItem) {
        isPreparingPhoto = true
        Task {
            defer {
                isPreparingPhoto = false
                pickedPhoto = nil
            }
            guard
                let data = try? await item.loadTransferable(type: Data.self),
                let image = UIImage(data: data)
            else {
                handle(.copyFailed)
                return
            }
            share(photo: image)
        }
    }

    private func share(photo: UIImage) {
        guard let jpeg = photo.jpegData(compressionQuality: 0.9) else {
            handle(.copyFailed)
            return
        }
        handle(exporter.shareToInstagramStories(
            stickerAt: imageURL,
            backgroundImage: jpeg,
            facebookAppID: InstagramSharing.facebookAppID
        ))
    }

    private func handle(_ outcome: ExportOutcome) {
        switch outcome {
        case .openedInstagramStories:
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            withAnimation {
                statusMessage = "No Instagram, arraste a figurinha para posicionar e publique."
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
