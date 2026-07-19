import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { Environment, Type, type JWSTransactionDecodedPayload } from '@apple/app-store-server-library';
import { buildApp } from '../../src/app.js';
import { stickers, storeTransactions } from '../../src/db/schema.js';
import { createFakeMailer } from '../../src/email/send.js';
import { createMemoryStorage } from '../../src/storage/memory.js';
import type { StoreTransactionVerifier } from '../../src/store/transactionVerifier.js';
import { withTestDb } from '../setup/db.js';
import {
  buildTestConfig, criarELogarComApp, criarPackPublicavelComApp,
} from '../setup/app.js';

const t = withTestDb();
const config = buildTestConfig(t.url);
let app: FastifyInstance;
let storage: ReturnType<typeof createMemoryStorage>;
let decoded: JWSTransactionDecodedPayload;
let verifier: StoreTransactionVerifier;

const criarELogar = criarELogarComApp(t.db, () => app);
const criarPackPublicavel = criarPackPublicavelComApp(t.db, () => app);

beforeEach(async () => {
  storage = createMemoryStorage();
  decoded = {
    transactionId: '200000000000001',
    originalTransactionId: '200000000000001',
    productId: 'com.daige.bodycreator.pack.premium',
    environment: Environment.SANDBOX,
    purchaseDate: Date.now(),
    signedDate: Date.now(),
    bundleId: config.APP_BUNDLE_ID,
    type: Type.NON_CONSUMABLE,
  };
  verifier = { async verify() { return decoded; } };
  app = buildApp({
    config, db: t.db, mailer: createFakeMailer(), storage,
    storeTransactionVerifier: verifier,
  });
  await app.ready();
});

async function preparePaidPack() {
  const cookie = await criarELogar('admin');
  const created = await criarPackPublicavel(cookie, 'premium');
  const configured = await app.inject({
    method: 'PATCH', url: `/packs/${created.packId}`, headers: { cookie },
    payload: { isFree: false, storeProductId: decoded.productId },
  });
  expect(configured.statusCode).toBe(200);
  const [sticker] = await t.db.select().from(stickers)
    .where(eq(stickers.id, created.stickerId)).limit(1);
  return { ...created, cookie, sticker: sticker! };
}

describe('POST /store/transactions', () => {
  it('valida sem login, registra a compra e emite acesso temporário', async () => {
    await preparePaidPack();
    const response = await app.inject({
      method: 'POST', url: '/store/transactions',
      payload: { signedTransaction: 'jws-assinado-com-tamanho-suficiente' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().productId).toBe(decoded.productId);
    expect(response.json().accessToken).toMatch(/\./);
    expect(await t.db.select().from(storeTransactions)).toHaveLength(1);
  });

  it('recusa transação revogada ou de outro tipo', async () => {
    await preparePaidPack();
    decoded.revocationDate = Date.now();
    let response = await app.inject({
      method: 'POST', url: '/store/transactions',
      payload: { signedTransaction: 'jws-assinado-com-tamanho-suficiente' },
    });
    expect(response.statusCode).toBe(400);

    delete decoded.revocationDate;
    decoded.type = Type.CONSUMABLE;
    response = await app.inject({
      method: 'POST', url: '/store/transactions',
      payload: { signedTransaction: 'jws-assinado-com-tamanho-suficiente' },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /catalog/assets/*', () => {
  it('mantém a capa pública e exige a compra para a figurinha paga', async () => {
    const paid = await preparePaidPack();
    const packResponse = await app.inject({
      method: 'GET', url: `/packs/${paid.packId}`,
      headers: { cookie: paid.cookie },
    });
    const coverKey = packResponse.json().coverKey as string;

    expect((await app.inject({
      method: 'GET', url: `/catalog/assets/${coverKey}`,
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: 'GET', url: `/catalog/assets/${paid.sticker.fileKey}`,
    })).statusCode).toBe(403);

    const validation = await app.inject({
      method: 'POST', url: '/store/transactions',
      payload: { signedTransaction: 'jws-assinado-com-tamanho-suficiente' },
    });
    const asset = await app.inject({
      method: 'GET', url: `/catalog/assets/${paid.sticker.fileKey}`,
      headers: { authorization: `Bearer ${validation.json().accessToken}` },
    });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toContain('image/png');
    expect(asset.headers['cache-control']).toContain('private');
  });
});
