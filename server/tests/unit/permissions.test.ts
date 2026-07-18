import { describe, it, expect } from 'vitest';
import {
  canDo, ALL_PERMISSIONS, assignablePermissions, validatePermissionAssignment,
} from '../../src/auth/permissions.js';

const admin = { role: 'admin' as const, permissions: [] };
const gerente = (p: string[]) => ({ role: 'gerente' as const, permissions: p });

describe('canDo', () => {
  it('dá todas as permissões ao admin, mesmo com lista vazia', () => {
    for (const p of ALL_PERMISSIONS) expect(canDo(admin, p)).toBe(true);
  });

  it('dá ao gerente apenas o que foi concedido', () => {
    const g = gerente(['sticker.import']);
    expect(canDo(g, 'sticker.import')).toBe(true);
    expect(canDo(g, 'pack.publish')).toBe(false);
  });

  it('separa editar de publicar', () => {
    const g = gerente(['pack.create', 'pack.edit']);
    expect(canDo(g, 'pack.edit')).toBe(true);
    expect(canDo(g, 'pack.publish')).toBe(false);
  });

  it('nunca reconhece user.manage num gerente, mesmo se gravado no banco', () => {
    expect(canDo(gerente(['user.manage']), 'user.manage')).toBe(false);
  });

  it('ignora permissão desconhecida', () => {
    expect(canDo(gerente(['pack.destroy.everything']), 'pack.edit')).toBe(false);
  });
});

describe('validatePermissionAssignment', () => {
  it('recusa conceder user.manage a gerente', () => {
    const r = validatePermissionAssignment('gerente', ['user.manage']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/user\.manage/);
  });

  it('aceita permissões válidas para gerente', () => {
    expect(validatePermissionAssignment('gerente', ['pack.edit']).ok).toBe(true);
  });

  it('recusa permissão inexistente', () => {
    expect(validatePermissionAssignment('gerente', ['voar']).ok).toBe(false);
  });
});

describe('assignablePermissions', () => {
  it('não oferece user.manage para gerente', () => {
    expect(assignablePermissions('gerente')).not.toContain('user.manage');
  });
});
