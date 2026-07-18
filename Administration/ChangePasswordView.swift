import SwiftUI

struct ChangePasswordView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmation = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section {
                Text("Troque sua senha")
                    .font(.title2.bold())
                Text("Por segurança, a senha inicial não pode ser usada para administrar o conteúdo.")
                    .foregroundStyle(.secondary)
            }

            Section("Nova senha") {
                SecureField("Senha atual", text: $currentPassword)
                    .textContentType(.password)
                SecureField("Nova senha", text: $newPassword)
                    .textContentType(.newPassword)
                SecureField("Confirmar nova senha", text: $confirmation)
                    .textContentType(.newPassword)
                Text("Use pelo menos 10 caracteres.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let errorMessage {
                Section { Text(errorMessage).foregroundStyle(.red) }
            }

            Section {
                Button(isSubmitting ? "Salvando…" : "Salvar nova senha") { submit() }
                    .disabled(isSubmitting || currentPassword.isEmpty || newPassword.isEmpty)
                Button("Sair", role: .destructive) { Task { await auth.logout() } }
            }
        }
        .navigationTitle("Segurança")
    }

    private func submit() {
        errorMessage = nil
        guard newPassword.count >= 10 else {
            errorMessage = "A nova senha precisa de ao menos 10 caracteres."
            return
        }
        guard newPassword == confirmation else {
            errorMessage = "A confirmação não confere com a nova senha."
            return
        }

        isSubmitting = true
        Task {
            defer { isSubmitting = false }
            do {
                try await auth.service.changePassword(current: currentPassword, new: newPassword)
                try await auth.refreshUser()
            } catch {
                auth.consume(error)
                errorMessage = error.localizedDescription
            }
        }
    }
}
