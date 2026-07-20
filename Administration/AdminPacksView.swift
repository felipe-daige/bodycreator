import SwiftUI

struct AdminPacksView: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var catalog: CatalogStore
    @State private var packs: [AdminPack] = []
    @State private var isLoading = true
    @State private var isPublishingCatalog = false
    @State private var showNewPack = false
    @State private var publicationMessage: String?
    @State private var errorMessage: String?

    var body: some View {
        List {
            if auth.isOwnerAdministrator {
                Section("Catálogo") {
                    Text("Publicar um pacote o deixa elegível. Este botão envia a versão atual de todos os pacotes publicados para quem usa o app.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button {
                        publishCatalog()
                    } label: {
                        Label(
                            isPublishingCatalog ? "Publicando…" : "Publicar catálogo agora",
                            systemImage: "icloud.and.arrow.up"
                        )
                    }
                    .disabled(isPublishingCatalog)
                    .accessibilityIdentifier("publish-catalog")
                    if let publicationMessage {
                        Label(publicationMessage, systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }

                    NavigationLink {
                        StorefrontEditorView()
                    } label: {
                        Label("Vitrine da Loja", systemImage: "rectangle.3.group")
                    }
                    .accessibilityIdentifier("owner-storefront")
                }
            }

            Section("Pacotes") {
                if isLoading {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if packs.isEmpty && errorMessage == nil {
                    Text("Nenhum pacote cadastrado ainda.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(packs) { pack in
                        NavigationLink {
                            AdminPackEditorView(packID: pack.id)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(pack.name).font(.headline)
                                    Spacer()
                                    Text(pack.status.label)
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(pack.status == .published ? Color.green : Color.secondary)
                                }
                                Text(pack.slug)
                                    .font(.caption.monospaced())
                                    .foregroundStyle(.secondary)
                                Text("Por \(pack.authorName)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(pack.isFree ? "Grátis" : "Compra única")
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(pack.isFree ? Color.secondary : Color.accentColor)
                            }
                            .padding(.vertical, 3)
                        }
                    }
                }
            }

            if let errorMessage {
                Section { Text(errorMessage).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Pacotes")
        .toolbar {
            if auth.isOwnerAdministrator {
                ToolbarItem(placement: .primaryAction) {
                    Button { showNewPack = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Novo pacote")
                }
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(isPresented: $showNewPack) {
            NewAdminPackView {
                showNewPack = false
                Task { await load() }
            }
            .environmentObject(auth)
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do { packs = try await auth.service.packs() }
        catch {
            auth.consume(error)
            errorMessage = error.localizedDescription
        }
    }

    private func publishCatalog() {
        isPublishingCatalog = true
        publicationMessage = nil
        errorMessage = nil
        Task {
            defer { isPublishingCatalog = false }
            do {
                let result = try await auth.service.publishCatalog()
                publicationMessage = "Versão \(result.version) publicada."
                await catalog.refresh()
            } catch {
                auth.consume(error)
                errorMessage = error.localizedDescription
            }
        }
    }
}

private struct NewAdminPackView: View {
    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    let onCreated: () -> Void

    @State private var slug = ""
    @State private var name = ""
    @State private var author = ""
    @State private var description = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Identificação") {
                    TextField("Identificador", text: $slug)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Text("Somente letras minúsculas, números e hífen. Ex.: harmonizacao-facial")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("Nome", text: $name)
                    TextField("Autor(a)", text: $author)
                }
                Section("Apresentação") {
                    TextField("Descrição", text: $description, axis: .vertical)
                        .lineLimit(2...5)
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Novo pacote")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSubmitting ? "Criando…" : "Criar") { submit() }
                        .disabled(isSubmitting || slug.isEmpty || name.count < 2 || author.count < 2)
                }
            }
        }
    }

    private func submit() {
        let regex = try? NSRegularExpression(pattern: "^[a-z0-9]+(-[a-z0-9]+)*$")
        let range = NSRange(slug.startIndex..., in: slug)
        guard regex?.firstMatch(in: slug, range: range) != nil else {
            errorMessage = "O identificador aceita apenas letras minúsculas, números e hífen."
            return
        }
        isSubmitting = true
        errorMessage = nil
        Task {
            defer { isSubmitting = false }
            do {
                _ = try await auth.service.createPack(
                    slug: slug,
                    name: name,
                    author: author,
                    description: description
                )
                onCreated()
                dismiss()
            } catch {
                auth.consume(error)
                errorMessage = error.localizedDescription
            }
        }
    }
}
