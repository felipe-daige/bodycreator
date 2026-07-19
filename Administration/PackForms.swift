import SwiftUI
import UniformTypeIdentifiers

struct EditPackInfoView: View {
    let pack: AdminPackDetail
    let onSaved: () -> Void

    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var description: String
    @State private var sortOrder: Int
    @State private var isFree: Bool
    @State private var storeProductID: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(pack: AdminPackDetail, onSaved: @escaping () -> Void) {
        self.pack = pack
        self.onSaved = onSaved
        _name = State(initialValue: pack.name)
        _description = State(initialValue: pack.description)
        _sortOrder = State(initialValue: pack.sortOrder)
        _isFree = State(initialValue: pack.isFree)
        _storeProductID = State(initialValue: pack.storeProductId ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Informações") {
                    TextField("Nome", text: $name)
                    TextField("Descrição", text: $description, axis: .vertical)
                        .lineLimit(2...5)
                    Stepper("Posição no catálogo: \(sortOrder)", value: $sortOrder)
                }
                Section("Loja") {
                    Toggle("Pacote gratuito", isOn: $isFree)
                    if !isFree {
                        TextField("ID do produto na App Store", text: $storeProductID)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Text("Crie um produto não consumível no App Store Connect. O preço é definido lá e aparece automaticamente para cada país.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Editar pacote")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Salvando…" : "Salvar") { save() }
                        .disabled(
                            isSaving || name.count < 2 ||
                            (!isFree && storeProductID.trimmingCharacters(in: .whitespaces).isEmpty)
                        )
                }
            }
        }
    }

    private func save() {
        isSaving = true
        errorMessage = nil
        Task {
            defer { isSaving = false }
            do {
                try await auth.service.updatePack(
                    id: pack.id,
                    name: name,
                    description: description,
                    sortOrder: sortOrder,
                    isFree: isFree,
                    storeProductID: isFree
                        ? nil
                        : storeProductID.trimmingCharacters(in: .whitespacesAndNewlines)
                )
                onSaved()
                dismiss()
            } catch {
                auth.consume(error)
                errorMessage = error.localizedDescription
            }
        }
    }
}

struct CoverUploadView: View {
    let packID: String
    let onUploaded: () -> Void

    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    @State private var selectedPNG: SelectedPNG?
    @State private var showImporter = false
    @State private var isUploading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("PNG com fundo transparente, até 2 MB, maior lado entre 512 e 2048 px.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Section("Arquivo") {
                    Button { showImporter = true } label: {
                        Label(selectedPNG?.fileName ?? "Escolher PNG no app Arquivos", systemImage: "folder")
                    }
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
                Section {
                    Button(isUploading ? "Enviando…" : "Enviar capa") { upload() }
                        .disabled(isUploading || selectedPNG == nil)
                }
            }
            .navigationTitle("Capa do pacote")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
            }
            .fileImporter(isPresented: $showImporter, allowedContentTypes: [.png]) { result in
                select(result)
            }
        }
    }

    private func select(_ result: Result<URL, Error>) {
        do { selectedPNG = try SelectedPNG.read(from: result.get()); errorMessage = nil }
        catch { selectedPNG = nil; errorMessage = error.localizedDescription }
    }

    private func upload() {
        guard let selectedPNG else { return }
        isUploading = true
        errorMessage = nil
        Task {
            defer { isUploading = false }
            do {
                try await auth.service.uploadCover(
                    packID: packID,
                    png: selectedPNG.data,
                    fileName: selectedPNG.fileName
                )
                onUploaded()
                dismiss()
            } catch {
                auth.consume(error)
                errorMessage = error.localizedDescription
            }
        }
    }
}

struct StickerUploadView: View {
    let pack: AdminPackDetail
    let onUploaded: () -> Void

    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    @State private var categoryID: String
    @State private var stickerID = ""
    @State private var name = ""
    @State private var tags = ""
    @State private var selectedPNG: SelectedPNG?
    @State private var showImporter = false
    @State private var isUploading = false
    @State private var errorMessage: String?

    init(pack: AdminPackDetail, onUploaded: @escaping () -> Void) {
        self.pack = pack
        self.onUploaded = onUploaded
        _categoryID = State(initialValue: pack.categories.first?.id ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("O PNG é enviado sem reencodificação. Regras: transparência, até 2 MB e maior lado entre 512 e 2048 px.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Section("Figurinha") {
                    Picker("Categoria", selection: $categoryID) {
                        ForEach(pack.categories) { Text($0.name).tag($0.id) }
                    }
                    TextField("Identificador", text: $stickerID)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Text("Somente letras minúsculas, números e hífen. O identificador é único em todo o catálogo e não pode começar com “cover”.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("Nome", text: $name)
                    TextField("Tags separadas por vírgula", text: $tags)
                }
                Section("Arquivo") {
                    Button { showImporter = true } label: {
                        Label(selectedPNG?.fileName ?? "Escolher PNG no app Arquivos", systemImage: "folder")
                    }
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
                Section {
                    Button(isUploading ? "Enviando…" : "Enviar figurinha") { upload() }
                        .disabled(
                            isUploading || selectedPNG == nil || categoryID.isEmpty ||
                            stickerID.isEmpty || name.isEmpty
                        )
                }
            }
            .navigationTitle("Nova figurinha")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
            }
            .fileImporter(isPresented: $showImporter, allowedContentTypes: [.png]) { result in
                select(result)
            }
        }
    }

    private func select(_ result: Result<URL, Error>) {
        do { selectedPNG = try SelectedPNG.read(from: result.get()); errorMessage = nil }
        catch { selectedPNG = nil; errorMessage = error.localizedDescription }
    }

    private func upload() {
        let regex = try? NSRegularExpression(pattern: "^[a-z0-9]+(-[a-z0-9]+)*$")
        let range = NSRange(stickerID.startIndex..., in: stickerID)
        guard regex?.firstMatch(in: stickerID, range: range) != nil else {
            errorMessage = "O identificador aceita apenas letras minúsculas, números e hífen."
            return
        }
        guard stickerID != "cover", !stickerID.hasPrefix("cover-") else {
            errorMessage = "O identificador não pode usar o prefixo reservado “cover”."
            return
        }
        guard let selectedPNG else { return }
        isUploading = true
        errorMessage = nil
        Task {
            defer { isUploading = false }
            do {
                _ = try await auth.service.uploadSticker(
                    packID: pack.id,
                    categoryID: categoryID,
                    id: stickerID,
                    name: name,
                    tags: tags.split(separator: ",").map {
                        $0.trimmingCharacters(in: .whitespacesAndNewlines)
                    }.filter { !$0.isEmpty },
                    png: selectedPNG.data,
                    fileName: selectedPNG.fileName
                )
                onUploaded()
                dismiss()
            } catch {
                auth.consume(error)
                errorMessage = error.localizedDescription
            }
        }
    }
}
