import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createFakeMailer } from '../../src/email/send.js';
import { createMemoryStorage } from '../../src/storage/memory.js';

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://x/x',
  SESSION_SECRET: 'x'.repeat(32),
  R2_ACCOUNT_ID: 'x',
  R2_ACCESS_KEY_ID: 'x',
  R2_SECRET_ACCESS_KEY: 'x',
  R2_BUCKET: 'x',
  R2_PUBLIC_BASE_URL: 'https://cdn.example.com',
  MAIL_FROM: 'nao-responda@example.com',
});

describe('GET /catalog/current', () => {
  it('é público e devolve o ponteiro sem exigir sessão', async () => {
    const storage = createMemoryStorage();
    const pointer = Buffer.from(JSON.stringify({
      version: 7,
      manifest: 'https://cdn.example.com/catalog/v7.json',
      checksum: 'abc',
    }));
    await storage.put('catalog/current.json', pointer, 'application/json');
    const app = buildApp({
      config, db: {} as never, mailer: createFakeMailer(), storage,
    });

    const response = await app.inject({ method: 'GET', url: '/catalog/current' });
    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe(7);
    expect(response.headers['cache-control']).toContain('max-age=60');
  });

  it('responde em pt-BR antes da primeira publicação', async () => {
    const app = buildApp({
      config, db: {} as never, mailer: createFakeMailer(), storage: createMemoryStorage(),
    });
    const response = await app.inject({ method: 'GET', url: '/catalog/current' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatch(/catálogo/i);
  });
});
