import { describe, it, expect } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createFakeMailer } from '../../src/email/send.js';

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://x/x',
  SESSION_SECRET: 'x'.repeat(32),
  PUBLIC_PANEL_ORIGIN: 'http://localhost:5173',
  R2_ACCOUNT_ID: 'x',
  R2_ACCESS_KEY_ID: 'x',
  R2_SECRET_ACCESS_KEY: 'x',
  R2_BUCKET: 'x',
  R2_PUBLIC_BASE_URL: 'https://cdn.example.com',
  MAIL_FROM: 'nao-responda@example.com',
});

describe('GET /health', () => {
  it('responde 200 com status ok', async () => {
    const app = buildApp({ config, db: {} as never, mailer: createFakeMailer() });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
