import SwiftUI

struct PermissionPickerView: View {
    let role: AdminRole
    @Binding var selection: Set<AdminPermission>

    var body: some View {
        if role == .admin {
            Label("Administradores têm todas as permissões.", systemImage: "checkmark.shield")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        } else {
            ForEach(AdminPermission.allCases) { permission in
                Toggle(isOn: binding(for: permission)) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(permission.label)
                        if permission.isAdminOnly {
                            Text("Exclusiva de administradores")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else if !permission.isAvailableNow {
                            Text("Será usada quando Loja e relatórios forem ativados")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .disabled(permission.isAdminOnly)
            }
        }
    }

    private func binding(for permission: AdminPermission) -> Binding<Bool> {
        Binding {
            selection.contains(permission) && !permission.isAdminOnly
        } set: { enabled in
            if enabled { selection.insert(permission) } else { selection.remove(permission) }
        }
    }
}
