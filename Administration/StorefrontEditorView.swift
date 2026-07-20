import SwiftUI

struct StorefrontEditorView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var config = StorefrontConfigDraft(hero: nil, sections: [])
    @State private var publishedPacks: [AdminPack] = []
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var message: String?
    @State private var errorMessage: String?

    var body: some View {
        List {
            if isLoading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else {
                explanation
                heroSection
                ForEach($config.sections) { $section in
                    sectionEditor($section)
                }
                Section {
                    Button { addSection() } label: {
                        Label("Nova seção", systemImage: "plus")
                    }
                }
                if let message {
                    Section {
                        Label(message, systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    }
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
        }
        .navigationTitle("Vitrine")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { EditButton() }
            ToolbarItem(placement: .confirmationAction) {
                Button(isSaving ? "Salvando…" : "Salvar") { save() }
                    .disabled(isSaving || isLoading)
                    .accessibilityIdentifier("storefront-save")
            }
        }
        .task { await load() }
    }

    private var explanation: some View {
        Section {
            Text("Monte a vitrine da Loja: escolha o destaque e organize os pacotes em seções. Depois de salvar, publique o catálogo para os clientes verem.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private var heroSection: some View {
        Section("Destaque") {
            Picker("Pacote em destaque", selection: heroBinding) {
                Text("Nenhum").tag(String?.none)
                ForEach(publishedPacks) { pack in
                    Text(pack.name).tag(String?.some(pack.slug))
                }
            }
        }
    }

    private func sectionEditor(_ section: Binding<StorefrontSectionDraft>) -> some View {
        let id = section.wrappedValue.id
        return Section("Seção") {
            TextField("Título da seção", text: section.title)
            ForEach(section.wrappedValue.packs, id: \.self) { slug in
                Text(packName(slug))
            }
            .onDelete { removePacks($0, from: id) }
            .onMove { movePacks($0, to: $1, in: id) }

            let disponiveis = availablePacks(inSectionID: id)
            if disponiveis.isEmpty {
                Text("Todos os pacotes publicados já estão nesta seção.")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Menu("Adicionar pacote") {
                    ForEach(disponiveis) { pack in
                        Button(pack.name) { addPack(pack.slug, to: id) }
                    }
                }
            }

            Button(role: .destructive) { removeSection(id) } label: {
                Label("Excluir seção", systemImage: "trash")
            }
            .accessibilityIdentifier("delete-section")
        }
    }

    // MARK: - Bindings & helpers

    private var heroBinding: Binding<String?> {
        Binding(get: { config.hero }, set: { config.hero = $0 })
    }

    private func packName(_ slug: String) -> String {
        publishedPacks.first { $0.slug == slug }?.name ?? slug
    }

    private func sectionIndex(_ id: String) -> Int? {
        config.sections.firstIndex { $0.id == id }
    }

    private func availablePacks(inSectionID id: String) -> [AdminPack] {
        guard let i = sectionIndex(id) else { return [] }
        let usados = Set(config.sections[i].packs)
        return publishedPacks.filter { !usados.contains($0.slug) }
    }

    private func addPack(_ slug: String, to id: String) {
        guard let i = sectionIndex(id) else { return }
        config.sections[i].packs.append(slug)
    }

    private func removePacks(_ offsets: IndexSet, from id: String) {
        guard let i = sectionIndex(id) else { return }
        config.sections[i].packs.remove(atOffsets: offsets)
    }

    private func movePacks(_ offsets: IndexSet, to destination: Int, in id: String) {
        guard let i = sectionIndex(id) else { return }
        config.sections[i].packs.move(fromOffsets: offsets, toOffset: destination)
    }

    private func addSection() {
        config.sections.append(
            StorefrontSectionDraft(id: UUID().uuidString, title: "Nova seção", packs: [])
        )
    }

    private func removeSection(_ id: String) {
        config.sections.removeAll { $0.id == id }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let cfg = auth.service.storefront()
            async let packs = auth.service.packs()
            config = try await cfg
            publishedPacks = try await packs.filter { $0.status == .published }
        } catch {
            auth.consume(error)
            errorMessage = friendly(error)
        }
    }

    private func save() {
        isSaving = true
        message = nil
        errorMessage = nil
        Task {
            defer { isSaving = false }
            do {
                try await auth.service.saveStorefront(config)
                message = "Vitrine salva. Publique o catálogo para os clientes verem."
            } catch {
                auth.consume(error)
                errorMessage = friendly(error)
            }
        }
    }

    /// Traduz erros técnicos em mensagem útil. Em especial, um 404 aqui significa
    /// que o servidor ainda não tem as rotas de Vitrine (backend desatualizado).
    private func friendly(_ error: Error) -> String {
        if let apiError = error as? APIError,
           case let .server(status, _) = apiError, status == 404 {
            return "Este servidor ainda não tem o recurso de Vitrine. Atualize o backend (deploy) para organizar a Loja por aqui."
        }
        return error.localizedDescription
    }
}
