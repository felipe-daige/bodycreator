import { describe, expect, it } from 'vitest';
import { createEntitlementToken, verifyEntitlementToken } from '../../src/store/entitlementToken.js';

describe('token de acesso a pacote pago', () => {
  const secret = 'segredo-de-teste-com-mais-de-32-caracteres';
  const now = Date.UTC(2026, 6, 19);

  it('assina e valida o Product ID', () => {
    const result = createEntitlementToken('com.daige.bodycreator.pack.a', secret, now);
    expect(verifyEntitlementToken(result.token, secret, now)?.productId)
      .toBe('com.daige.bodycreator.pack.a');
  });

  it('recusa adulteração e expiração', () => {
    const result = createEntitlementToken('com.daige.bodycreator.pack.a', secret, now);
    expect(verifyEntitlementToken(`${result.token}x`, secret, now)).toBeNull();
    expect(verifyEntitlementToken(result.token, secret, (result.expiresAt + 1) * 1000)).toBeNull();
  });
});
