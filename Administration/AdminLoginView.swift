import SwiftUI

struct AdminLoginView: View {
    @EnvironmentObject private var auth: AuthStore
    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section {
                VStack(spacing: 12) {
                    Image(systemName: "lock.shield.fill")
                        .font(.system(size: 42))
                        .foregroundStyle(Color.accentColor)
                    Text("Área administrativa")
                        .font(.title2.bold())
                    Text("Entre para gerenciar usuários, permissões, pacotes e figurinhas. Quem usa o catálogo não precisa de conta.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }

            Section("Acesso") {
                TextField("E-mail", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("admin-email")
                SecureField("Senha", text: $password)
                    .textContentType(.password)
                    .accessibilityIdentifier("admin-password")
            }

            if let message = errorMessage ?? auth.connectionMessage {
                Section {
                    Label(message, systemImage: "exclamationmark.triangle")
                        .font(.subheadline)
                        .foregroundStyle(.red)
                }
            }

            Section {
                Button {
                    submit()
                } label: {
                    HStack {
                        Spacer()
                        if isSubmitting { ProgressView().padding(.trailing, 6) }
                        Text(isSubmitting ? "Entrando…" : "Entrar")
                        Spacer()
                    }
                }
                .disabled(isSubmitting || email.isEmpty || password.isEmpty)
                .accessibilityIdentifier("admin-login")
            }
        }
        .navigationTitle("Gerenciar")
    }

    private func submit() {
        errorMessage = nil
        isSubmitting = true
        Task {
            defer { isSubmitting = false }
            do {
                try await auth.login(email: email, password: password)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
