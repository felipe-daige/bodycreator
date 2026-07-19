import { describe, expect, it } from 'vitest';
import { Environment, Type } from '@apple/app-store-server-library';
import { loadConfig } from '../../src/config.js';
import { createAppleStoreTransactionVerifier } from '../../src/store/transactionVerifier.js';

const base = {
  DATABASE_URL: 'postgres://x/x',
  SESSION_SECRET: 's'.repeat(32),
  R2_ACCOUNT_ID: 'x',
  R2_ACCESS_KEY_ID: 'x',
  R2_SECRET_ACCESS_KEY: 'x',
  R2_BUCKET: 'x',
  MAIL_FROM: 'nao-responda@example.com',
};

function unsignedXcodeJws() {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'ES256' })}.${encode({
    transactionId: '1', originalTransactionId: '1',
    productId: 'com.daige.bodycreator.pack.demo',
    bundleId: 'com.daige.bodycreator', environment: Environment.XCODE,
    purchaseDate: Date.now(), signedDate: Date.now(), type: Type.NON_CONSUMABLE,
  })}.assinatura-local`;
}

describe('validação de transação por ambiente', () => {
  it('aceita o payload local do Xcode somente em desenvolvimento', async () => {
    const verifier = createAppleStoreTransactionVerifier(loadConfig({
      ...base, NODE_ENV: 'development',
    }));
    expect((await verifier.verify(unsignedXcodeJws())).environment).toBe(Environment.XCODE);
  });

  it('não deixa a exceção local chegar a produção', async () => {
    const verifier = createAppleStoreTransactionVerifier(loadConfig({
      ...base, NODE_ENV: 'production', APP_APPLE_ID: '123456789',
    }));
    await expect(verifier.verify(unsignedXcodeJws())).rejects.toThrow(/ambiente/i);
  });
});
