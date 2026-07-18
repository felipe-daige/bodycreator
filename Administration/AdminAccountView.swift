import SwiftUI

struct AdminAccountView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var showDeleteAccount = false

    var body: some View {
        Form {
            if let user = auth.user {
                Section("Conta") {
                    LabeledContent("Nome", value: user.name)
                    LabeledContent("E-mail", value: user.email)
                    LabeledContent("Papel", value: user.role.label)
                }
            }

            Section {
                Button("Sair", role: .destructive) {
                    Task { await auth.logout() }
                }
            }

            Section("Excluir conta") {
                Text("A exclusão remove seus dados pessoais e encerra o acesso administrativo. O histórico operacional permanece sem seu nome ou e-mail.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button("Excluir minha conta", role: .destructive) {
                    showDeleteAccount = true
                }
            }
        }
        .navigationTitle("Minha conta")
        .sheet(isPresented: $showDeleteAccount) {
            DeleteAccountView()
                .environmentObject(auth)
        }
    }
}

private struct DeleteAccountView: View {
    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var isDeleting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Esta ação não pode ser desfeita.")
                        .font(.headline)
                    Text("Confirme sua senha para apagar nome, e-mail e credenciais desta conta.")
                        .foregroundStyle(.secondary)
                }
                Section("Confirmação") {
                    SecureField("Senha atual", text: $password)
                        .textContentType(.password)
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
                Section {
                    Button(isDeleting ? "Excluindo…" : "Excluir conta definitivamente", role: .destructive) {
                        deleteAccount()
                    }
                    .disabled(isDeleting || password.isEmpty)
                }
            }
            .navigationTitle("Excluir conta")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
            }
        }
    }

    private func deleteAccount() {
        isDeleting = true
        errorMessage = nil
        Task {
            defer { isDeleting = false }
            do {
                try await auth.deleteAccount(currentPassword: password)
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
