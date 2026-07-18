import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import FormData from 'form-data';
import { withTestDb } from '../setup/db.js';
import { buildApp } from '../../src/app.js';
import { createFakeMailer } from '../../src/email/send.js';
import { createMemoryStorage } from '../../src/storage/memory.js';
import { buildTestConfig, criarELogarComApp, criarPackComCategoriaComApp } from '../setup/app.js';

const t = withTestDb();
const config = buildTestConfig(t.url);
let app: FastifyInstance;

const criarELogar = criarELogarComApp(t.db, () => app);
const criarPackComCategoria = criarPackComCategoriaComApp(() => app);

beforeEach(async () => {
  app = buildApp({ config, db: t.db, mailer: createFakeMailer(), storage: createMemoryStorage() });
  await app.ready();
});

// Erros que o próprio framework gera (multipart, rate-limit) chegam em
// inglês por padrão. A regra do sistema é "toda mensagem ao usuário em
// pt-BR" — sem tradução essas escapavam.
describe('tradução pt-BR de erros do framework', () => {
  it('413 do multipart vira mensagem em pt-BR sobre o tamanho máximo', async () => {
    const cookie = await criarELogar('admin');
    const { packId, categoryId } = await criarPackComCategoria(cookie);

    const form = new FormData();
    form.append('id', 'arquivo-grande');
    form.append('name', 'Arquivo Grande');
    form.append('categoryId', categoryId);
    form.append('tags', JSON.stringify([]));
    // 3 MB: passa do limite de 2 MB configurado para o campo de arquivo.
    form.append('file', Buffer.alloc(3 * 1024 * 1024, 1), { filename: 'grande.png', contentType: 'image/png' });

    const res = await app.inject({
      method: 'POST', url: `/packs/${packId}/stickers`,
      headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer(),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error).toBe('O arquivo passa do tamanho máximo permitido (2 MB).');
  });

  it('429 do rate limit de IP vira mensagem em pt-BR', async () => {
    // E-mails diferentes a cada tentativa: nenhum deles bate as 10 falhas do
    // bloqueio por conta (Task de trustProxy), então o único mecanismo que
    // pode disparar aqui é o rate limit por IP da própria rota.
    for (let i = 0; i < 10; i += 1) {
      const res = await app.inject({
        method: 'POST', url: '/auth/login',
        payload: { email: `inexistente-${i}@exemplo.com`, password: 'x' },
      });
      expect(res.statusCode).toBe(401);
    }
    const bloqueada = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: 'inexistente-10@exemplo.com', password: 'x' },
    });
    expect(bloqueada.statusCode).toBe(429);
    expect(bloqueada.json().error).toBe('Muitas tentativas. Aguarde alguns minutos e tente de novo.');
  });
});
