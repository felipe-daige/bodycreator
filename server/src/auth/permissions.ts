export const ALL_PERMISSIONS = [
  'sticker.import',
  'pack.create',
  'pack.edit',
  'pack.publish',
  'pack.price',
  'report.view',
  'user.manage',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
export type Role = 'admin' | 'gerente';

// user.manage é exclusiva de admin: se um gerente pudesse conceder permissões,
// o teto de privilégio do sistema deixaria de ser raciocinável.
const ADMIN_ONLY: readonly Permission[] = ['user.manage'];

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}

export function assignablePermissions(role: Role): Permission[] {
  return role === 'admin'
    ? [...ALL_PERMISSIONS]
    : ALL_PERMISSIONS.filter((p) => !ADMIN_ONLY.includes(p));
}

export function canDo(
  actor: { role: Role; permissions: string[] },
  permission: Permission,
): boolean {
  if (actor.role === 'admin') return true;
  if (ADMIN_ONLY.includes(permission)) return false;
  return actor.permissions.includes(permission);
}

export function validatePermissionAssignment(
  role: Role,
  permissions: string[],
): { ok: true } | { ok: false; error: string } {
  for (const p of permissions) {
    if (!isPermission(p)) {
      return { ok: false, error: `Permissão desconhecida: ${p}` };
    }
    if (role !== 'admin' && ADMIN_ONLY.includes(p)) {
      return { ok: false, error: `A permissão ${p} é exclusiva de administradores.` };
    }
  }
  return { ok: true };
}
