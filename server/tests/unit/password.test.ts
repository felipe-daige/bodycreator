import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/auth/password.js';

describe('senhas', () => {
  it('verifica a senha correta', async () => {
    const hash = await hashPassword('senha-de-teste-123');
    expect(await verifyPassword(hash, 'senha-de-teste-123')).toBe(true);
  });

  it('recusa a senha errada', async () => {
    const hash = await hashPassword('senha-de-teste-123');
    expect(await verifyPassword(hash, 'senha-errada')).toBe(false);
  });

  it('gera hashes diferentes para a mesma senha', async () => {
    expect(await hashPassword('igual')).not.toBe(await hashPassword('igual'));
  });

  it('usa Argon2id', async () => {
    expect(await hashPassword('x')).toMatch(/^\$argon2id\$/);
  });

  it('devolve false em hash corrompido em vez de estourar', async () => {
    expect(await verifyPassword('não-é-um-hash', 'x')).toBe(false);
  });
});
