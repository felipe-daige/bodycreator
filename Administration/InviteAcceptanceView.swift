import SwiftUI

struct InviteAcceptanceView: View {
    let token: String
    let onFinished: () -> Void

    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    @State private var details: InviteDetails?
    @State private var name = ""
    @State private var password = ""
    @State private var confirmation = ""
    @State private var isLoading = true
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                if isLoading {
                    HStack { Spacer(); ProgressView("Validando convite…"); Spacer() }
                } else if let details {
                    Section("Convite") {
                        LabeledContent("E-mail", value: details.email)
                        LabeledContent("Papel", value: details.role.label)
                    }
                    Section("Crie seu acesso") {
                        TextField("Nome", text: $name)
                            .textContentType(.name)
                        SecureField("Senha", text: $password)
                            .textContentType(.newPassword)
                        SecureField("Confirmar senha", text: $confirmation)
                            .textContentType(.newPassword)
                        Text("A senha precisa de ao menos 10 caracteres.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Section {
                        Button(isSubmitting ? "Criando conta…" : "Criar conta e entrar") { submit(details) }
                            .disabled(isSubmitting || name.count < 2 || password.isEmpty)
                    }
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Aceitar convite")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fechar") { dismiss() }
                }
            }
            .task { await validate() }
        }
    }

    private func validate() async {
        isLoading = true
        defer { isLoading = false }
        do { details = try await auth.service.inviteDetails(token: token) }
        catch { errorMessage = error.localizedDescription }
    }

    private func submit(_ details: InviteDetails) {
        errorMessage = nil
        guard password.count >= 10 else {
            errorMessage = "A senha precisa de ao menos 10 caracteres."
            return
        }
        guard password == confirmation else {
            errorMessage = "A confirmação não confere com a senha."
            return
        }
        isSubmitting = true
        Task {
            defer { isSubmitting = false }
            do {
                try await auth.service.acceptInvite(token: token, name: name, password: password)
                try await auth.login(email: details.email, password: password)
                onFinished()
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
