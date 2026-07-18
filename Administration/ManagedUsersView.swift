import SwiftUI

struct ManagedUsersView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var users: [ManagedUser] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showInvite = false
    @State private var lastInvite: InviteSummary?

    var body: some View {
        List {
            if let lastInvite {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Convite enviado para \(lastInvite.email)", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                        Button("Reenviar convite") { resend(lastInvite) }
                    }
                }
            }

            if isLoading {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if users.isEmpty && errorMessage == nil {
                ContentEmptyUsersView()
            } else {
                ForEach(users) { user in
                    NavigationLink {
                        UserPermissionsView(user: user) { Task { await load() } }
                    } label: {
                        UserRow(user: user)
                    }
                }
            }

            if let errorMessage {
                Section { Text(errorMessage).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Usuários")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showInvite = true } label: { Image(systemName: "person.badge.plus") }
                    .accessibilityLabel("Convidar usuário")
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .sheet(isPresented: $showInvite) {
            InviteUserView { invite in
                lastInvite = invite
                showInvite = false
            }
            .environmentObject(auth)
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            users = try await auth.service.users()
        } catch {
            auth.consume(error)
            errorMessage = error.localizedDescription
        }
    }

    private func resend(_ invite: InviteSummary) {
        Task {
            do { try await auth.service.resendInvite(id: invite.id) }
            catch { errorMessage = error.localizedDescription }
        }
    }
}

private struct ContentEmptyUsersView: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "person.2").font(.largeTitle).foregroundStyle(.secondary)
            Text("Nenhum usuário cadastrado").foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
    }
}

private struct UserRow: View {
    let user: ManagedUser

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(user.name).font(.headline)
                Spacer()
                Text(user.status.label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(user.status == .active ? .green : .secondary)
            }
            Text(user.email).font(.subheadline).foregroundStyle(.secondary)
            Text(user.role.label).font(.caption).foregroundStyle(Color.accentColor)
        }
        .padding(.vertical, 2)
    }
}

private struct InviteUserView: View {
    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    let onSent: (InviteSummary) -> Void

    @State private var email = ""
    @State private var role: AdminRole = .manager
    @State private var permissions: Set<AdminPermission> = []
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Pessoa") {
                    TextField("E-mail", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Picker("Papel", selection: $role) {
                        ForEach(AdminRole.allCases) { Text($0.label).tag($0) }
                    }
                    .onChange(of: role) { newRole in
                        if newRole == .manager { permissions.remove(.manageUsers) }
                    }
                }
                Section("Permissões") {
                    PermissionPickerView(role: role, selection: $permissions)
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Convidar")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSubmitting ? "Enviando…" : "Enviar") { submit() }
                        .disabled(isSubmitting || email.isEmpty)
                }
            }
        }
    }

    private func submit() {
        isSubmitting = true
        errorMessage = nil
        Task {
            defer { isSubmitting = false }
            do {
                let invite = try await auth.service.invite(
                    email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                    role: role,
                    permissions: role == .admin ? [] : permissions
                )
                onSent(invite)
            } catch {
                auth.consume(error)
                errorMessage = error.localizedDescription
            }
        }
    }
}

private struct UserPermissionsView: View {
    @EnvironmentObject private var auth: AuthStore
    let user: ManagedUser
    let onChanged: () -> Void

    @State private var permissions: Set<AdminPermission>
    @State private var isSaving = false
    @State private var isDisabling = false
    @State private var showDisableConfirmation = false
    @State private var errorMessage: String?
    @Environment(\.dismiss) private var dismiss

    init(user: ManagedUser, onChanged: @escaping () -> Void) {
        self.user = user
        self.onChanged = onChanged
        _permissions = State(initialValue: Set(user.permissions.compactMap(AdminPermission.init(rawValue:))))
    }

    var body: some View {
        Form {
            Section("Usuário") {
                LabeledContent("Nome", value: user.name)
                LabeledContent("E-mail", value: user.email)
                LabeledContent("Papel", value: user.role.label)
                LabeledContent("Status", value: user.status.label)
            }
            Section("Permissões") {
                PermissionPickerView(role: user.role, selection: $permissions)
                if user.role == .manager {
                    Button(isSaving ? "Salvando…" : "Salvar permissões") { save() }
                        .disabled(isSaving)
                }
            }
            if user.status != .disabled, user.id != auth.user?.id {
                Section {
                    Button(isDisabling ? "Desativando…" : "Desativar acesso", role: .destructive) {
                        showDisableConfirmation = true
                    }
                    .disabled(isDisabling)
                } footer: {
                    Text("A pessoa perde o acesso na próxima requisição.")
                }
            }
            if let errorMessage {
                Section { Text(errorMessage).foregroundStyle(.red) }
            }
        }
        .navigationTitle(user.name)
        .confirmationDialog(
            "Desativar o acesso de \(user.name)?",
            isPresented: $showDisableConfirmation,
            titleVisibility: .visible
        ) {
            Button("Desativar", role: .destructive) { disable() }
            Button("Cancelar", role: .cancel) {}
        }
    }

    private func save() {
        isSaving = true
        errorMessage = nil
        Task {
            defer { isSaving = false }
            do {
                try await auth.service.updateUser(id: user.id, permissions: permissions)
                onChanged()
            } catch {
                auth.consume(error)
                errorMessage = error.localizedDescription
            }
        }
    }

    private func disable() {
        isDisabling = true
        errorMessage = nil
        Task {
            defer { isDisabling = false }
            do {
                try await auth.service.disableUser(id: user.id)
                onChanged()
                dismiss()
            } catch {
                auth.consume(error)
                errorMessage = error.localizedDescription
            }
        }
    }
}
