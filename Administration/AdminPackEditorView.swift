import SwiftUI

struct AdminPackEditorView: View {
    let packID: String

    @EnvironmentObject private var auth: AuthStore
    @State private var pack: AdminPackDetail?
    @State private var isLoading = true
    @State private var isChangingPublication = false
    @State private var isCreatingCategory = false
    @State private var newCategory = ""
    @State private var showEditInfo = false
    @State private var showCoverUpload = false
    @State private var showStickerUpload = false
    @State private var stickerToDelete: AdminSticker?
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if isLoading && pack == nil {
                ProgressView("Carregando pacote…")
            } else if let pack {
                form(for: pack)
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle").font(.largeTitle)
                    Text(errorMessage ?? "Não foi possível carregar o pacote.")
                        .multilineTextAlignment(.center)
                    Button("Tentar novamente") { Task { await load() } }
                }
                .padding()
            }
        }
        .navigationTitle(pack?.name ?? "Pacote")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $showEditInfo) {
            if let pack {
                EditPackInfoView(pack: pack) {
                    showEditInfo = false
                    Task { await load() }
                }
                .environmentObject(auth)
            }
        }
        .sheet(isPresented: $showCoverUpload) {
            CoverUploadView(packID: packID) {
                showCoverUpload = false
                Task { await load() }
            }
            .environmentObject(auth)
        }
        .sheet(isPresented: $showStickerUpload) {
            if let pack {
                StickerUploadView(pack: pack) {
                    showStickerUpload = false
                    Task { await load() }
                }
                .environmentObject(auth)
            }
        }
        .confirmationDialog(
            "Excluir \(stickerToDelete?.name ?? "esta figurinha")?",
            isPresented: Binding(
                get: { stickerToDelete != nil },
                set: { if !$0 { stickerToDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Excluir", role: .destructive) {
                if let stickerToDelete { delete(stickerToDelete) }
            }
            Button("Cancelar", role: .cancel) { stickerToDelete = nil }
        } message: {
            Text("Ela sai do próximo catálogo publicado. Versões antigas continuam imutáveis.")
        }
    }

    private func form(for pack: AdminPackDetail) -> some View {
        Form {
            Section("Informações") {
                LabeledContent("Identificador", value: pack.slug)
                LabeledContent("Autor(a)", value: pack.authorName)
                LabeledContent("Status", value: pack.status.label)
                if !pack.description.isEmpty { Text(pack.description).foregroundStyle(.secondary) }
                if auth.isOwnerAdministrator {
                    Button("Editar informações") { showEditInfo = true }
                }
            }

            if auth.isOwnerAdministrator {
                Section("Capa") {
                    Label(
                        pack.coverKey == nil ? "Este pacote ainda não tem capa." : "Capa cadastrada.",
                        systemImage: pack.coverKey == nil ? "photo.badge.exclamationmark" : "checkmark.circle"
                    )
                    .foregroundStyle(pack.coverKey == nil ? Color.orange : Color.green)
                    Button(pack.coverKey == nil ? "Enviar capa" : "Substituir capa") {
                        showCoverUpload = true
                    }
                }
            }

            if auth.isOwnerAdministrator {
                Section("Publicação do pacote") {
                    Text("Esta ação só torna o pacote elegível. Depois, publique o catálogo na tela anterior para a mudança chegar aos usuários.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button(
                        isChangingPublication
                            ? "Salvando…"
                            : (pack.status == .published ? "Despublicar pacote" : "Publicar pacote"),
                        role: pack.status == .published ? .destructive : nil
                    ) {
                        changePublication(pack.status != .published)
                    }
                    .disabled(isChangingPublication)
                }
            }

            Section("Categorias") {
                if pack.categories.isEmpty {
                    Text("Nenhuma categoria criada.").foregroundStyle(.secondary)
                } else {
                    ForEach(pack.categories) { Text($0.name) }
                }
                if auth.isOwnerAdministrator {
                    TextField("Nova categoria", text: $newCategory)
                    Button(isCreatingCategory ? "Criando…" : "Criar categoria") { createCategory() }
                        .disabled(isCreatingCategory || newCategory.count < 2)
                }
            }

            if auth.isOwnerAdministrator {
                Section {
                    Button { showStickerUpload = true } label: {
                        Label("Enviar figurinha", systemImage: "square.and.arrow.up")
                    }
                    .disabled(pack.categories.isEmpty)
                    if pack.categories.isEmpty {
                        Text("Crie uma categoria antes de enviar figurinhas.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section("Figurinhas (\(pack.stickers.count))") {
                if pack.stickers.isEmpty {
                    Text("Nenhuma figurinha enviada.").foregroundStyle(.secondary)
                } else {
                    ForEach(pack.stickers) { sticker in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(sticker.name).font(.headline)
                            Text(sticker.id).font(.caption.monospaced()).foregroundStyle(.secondary)
                            Text(categoryName(for: sticker, in: pack))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if !sticker.tags.isEmpty {
                                Text(sticker.tags.joined(separator: ", "))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .swipeActions {
                            if auth.isOwnerAdministrator {
                                Button("Excluir", role: .destructive) { stickerToDelete = sticker }
                            }
                        }
                    }
                }
            }

            if let errorMessage {
                Section { Text(errorMessage).foregroundStyle(.red) }
            }
        }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do { pack = try await auth.service.pack(id: packID) }
        catch {
            auth.consume(error)
            errorMessage = error.localizedDescription
        }
    }

    private func changePublication(_ published: Bool) {
        isChangingPublication = true
        errorMessage = nil
        Task {
            defer { isChangingPublication = false }
            do {
                try await auth.service.setPackPublished(id: packID, published: published)
                await load()
            } catch {
                auth.consume(error)
                errorMessage = error.localizedDescription
            }
        }
    }

    private func createCategory() {
        isCreatingCategory = true
        errorMessage = nil
        Task {
            defer { isCreatingCategory = false }
            do {
                _ = try await auth.service.createCategory(packID: packID, name: newCategory)
                newCategory = ""
                await load()
            } catch {
                auth.consume(error)
                errorMessage = error.localizedDescription
            }
        }
    }

    private func delete(_ sticker: AdminSticker) {
        stickerToDelete = nil
        Task {
            do {
                try await auth.service.deleteSticker(id: sticker.id)
                await load()
            } catch {
                auth.consume(error)
                errorMessage = error.localizedDescription
            }
        }
    }

    private func categoryName(for sticker: AdminSticker, in pack: AdminPackDetail) -> String {
        pack.categories.first(where: { $0.id == sticker.categoryId })?.name ?? "Categoria desconhecida"
    }
}
