import { describe, it, expect, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import FormData from 'form-data';
import { withTestDb } from '../setup/db.js';
import { buildApp } from '../../src/app.js';
import { createFakeMailer } from '../../src/email/send.js';
import { createMemoryStorage } from '../../src/storage/memory.js';
import { buildTestConfig, criarELogarComApp, criarPackComCategoriaComApp } from '../setup/app.js';
import { pngComAlfa, pngSemAlfa } from '../fixtures/make-fixtures.js';
import { stickers } from '../../src/db/schema.js';

const t = withTestDb();
const config = buildTestConfig(t.url);
let app: FastifyInstance;
let storage: ReturnType<typeof createMemoryStorage>;

const criarELogar = criarELogarComApp(t.db, () => app);
const criarPackComCategoria = criarPackComCategoriaComApp(() => app);

beforeEach(async () => {
  storage = createMemoryStorage();
  app = buildApp({ config, db: t.db, mailer: createFakeMailer(), storage });
  await app.ready();
});

// O helper do brief (Task 11) não incluía categoryId no formulário, mas a
// rota exige uma categoria válida do pacote — sem isso todo upload cairia em
// 400 antes de chegar à validação de PNG. Aqui o campo é enviado explicitamente.
async function subirFigurinha(
  cookie: string, packId: string, categoryId: string, id: string, buffer: Buffer,
) {
  const form = new FormData();
  form.append('id', id);
  form.append('name', 'Seta reta');
  form.append('categoryId', categoryId);
  form.append('tags', JSON.stringify(['seta', 'apontar']));
  form.append('file', buffer, { filename: `${id}.png`, contentType: 'image/png' });
  return app.inject({
    method: 'POST', url: `/packs/${packId}/stickers`,
    headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer(),
  });
}

describe('POST /packs/:id/stickers', () => {
  it('aceita PNG válido e grava os metadados', async () => {
    const cookie = await criarELogar('admin');
    const { packId, categoryId } = await criarPackComCategoria(cookie);
    const res = await subirFigurinha(cookie, packId, categoryId, 'seta-reta', await pngComAlfa());
    expect(res.statusCode).toBe(201);

    const [s] = await t.db.select().from(stickers);
    expect(s!.id).toBe('seta-reta');
    expect(s!.width).toBe(1024);
    expect(s!.tags).toEqual(['seta', 'apontar']);
  });

  it('guarda no storage exatamente os bytes recebidos, com o checksum na chave', async () => {
    const cookie = await criarELogar('admin');
    const { packId, categoryId } = await criarPackComCategoria(cookie);
    const original = await pngComAlfa();
    await subirFigurinha(cookie, packId, categoryId, 'circulo', original);

    const checksum8 = createHash('sha256').update(original).digest('hex').slice(0, 8);
    const [s] = await t.db.select().from(stickers);
    expect(s!.fileKey).toMatch(new RegExp(`circulo-${checksum8}\\.png$`));
    expect(await storage.get(s!.fileKey)).toEqual(original);
  });

  it('apagar e recriar a mesma figurinha com bytes diferentes gera uma chave nova', async () => {
    const cookie = await criarELogar('admin');
    const { packId, categoryId } = await criarPackComCategoria(cookie);

    const primeira = await subirFigurinha(cookie, packId, categoryId, 'reciclada', await pngComAlfa());
    expect(primeira.statusCode).toBe(201);
    const chaveAntiga = primeira.json().fileKey as string;

    await app.inject({ method: 'DELETE', url: '/stickers/reciclada', headers: { cookie } });

    const bytesNovos = await pngComAlfa(600, 600);
    const segunda = await subirFigurinha(cookie, packId, categoryId, 'reciclada', bytesNovos);
    expect(segunda.statusCode).toBe(201);
    const chaveNova = segunda.json().fileKey as string;

    expect(chaveNova).not.toBe(chaveAntiga);
    expect(await storage.get(chaveNova)).toEqual(bytesNovos);
    // O objeto antigo permanece no R2: manifestos já publicados o referenciam.
    expect(await storage.get(chaveAntiga)).not.toBeNull();
  });

  it('recusa PNG sem alfa com mensagem em pt-BR', async () => {
    const cookie = await criarELogar('admin');
    const { packId, categoryId } = await criarPackComCategoria(cookie);
    const res = await subirFigurinha(cookie, packId, categoryId, 'sem-alfa', await pngSemAlfa());
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/transparente/i);
    expect(await t.db.select().from(stickers)).toHaveLength(0);
  });

  it('recusa id já usado em outro pacote', async () => {
    const cookie = await criarELogar('admin');
    const a = await criarPackComCategoria(cookie, 'pack-a');
    const b = await criarPackComCategoria(cookie, 'pack-b');
    await subirFigurinha(cookie, a.packId, a.categoryId, 'repetido', await pngComAlfa());
    const res = await subirFigurinha(cookie, b.packId, b.categoryId, 'repetido', await pngComAlfa());
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/já existe/i);
  });

  it('recusa categoria que pertence a outro pacote', async () => {
    const cookie = await criarELogar('admin');
    const a = await criarPackComCategoria(cookie, 'pack-c');
    const b = await criarPackComCategoria(cookie, 'pack-d');
    const res = await subirFigurinha(cookie, a.packId, b.categoryId, 'errada', await pngComAlfa());
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/não pertence/i);
    expect(await t.db.select().from(stickers)).toHaveLength(0);
  });

  it('recusa gerente sem sticker.import com 403', async () => {
    const admin = await criarELogar('admin');
    const { packId, categoryId } = await criarPackComCategoria(admin);
    const gerente = await criarELogar('gerente', ['pack.edit']);
    const res = await subirFigurinha(gerente, packId, categoryId, 'x', await pngComAlfa());
    expect(res.statusCode).toBe(403);
  });

  it('recusa id fora do formato slug', async () => {
    const cookie = await criarELogar('admin');
    const { packId, categoryId } = await criarPackComCategoria(cookie);
    const res = await subirFigurinha(cookie, packId, categoryId, 'Seta Reta!', await pngComAlfa());
    expect(res.statusCode).toBe(400);
  });

  it('reserva o prefixo das capas para não expor uma figurinha paga', async () => {
    const cookie = await criarELogar('admin');
    const { packId, categoryId } = await criarPackComCategoria(cookie);
    const res = await subirFigurinha(
      cookie, packId, categoryId, 'cover-segreda', await pngComAlfa(),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/prefixo reservado/i);
    expect(await t.db.select().from(stickers)).toHaveLength(0);
  });

  // JSON.parse cru sem guarda: texto que não é JSON vira exceção não tratada
  // (500). Precisa virar 400 em pt-BR, como qualquer outro dado de entrada
  // ruim.
  it('recusa tags que não são JSON válido, com mensagem em pt-BR', async () => {
    const cookie = await criarELogar('admin');
    const { packId, categoryId } = await criarPackComCategoria(cookie);
    const form = new FormData();
    form.append('id', 'tags-invalidas');
    form.append('name', 'Tags Inválidas');
    form.append('categoryId', categoryId);
    form.append('tags', 'isto não é json');
    form.append('file', await pngComAlfa(), { filename: 'x.png', contentType: 'image/png' });
    const res = await app.inject({
      method: 'POST', url: `/packs/${packId}/stickers`,
      headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/lista de textos/i);
    expect(await t.db.select().from(stickers)).toHaveLength(0);
  });

  // JSON válido mas não-array (ex.: "42") passava direto pro banco e quebrava
  // a decodificação de [String] no app iOS quando o manifesto era publicado.
  it('recusa tags que são JSON válido mas não uma lista, com mensagem em pt-BR', async () => {
    const cookie = await criarELogar('admin');
    const { packId, categoryId } = await criarPackComCategoria(cookie);
    const form = new FormData();
    form.append('id', 'tags-nao-lista');
    form.append('name', 'Tags Não Lista');
    form.append('categoryId', categoryId);
    form.append('tags', '42');
    form.append('file', await pngComAlfa(), { filename: 'x.png', contentType: 'image/png' });
    const res = await app.inject({
      method: 'POST', url: `/packs/${packId}/stickers`,
      headers: { cookie, ...form.getHeaders() }, payload: form.getBuffer(),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/lista de textos/i);
    expect(await t.db.select().from(stickers)).toHaveLength(0);
  });

  it('recusa 401 sem sessão', async () => {
    const admin = await criarELogar('admin');
    const { packId, categoryId } = await criarPackComCategoria(admin);
    const form = new FormData();
    form.append('id', 'sem-sessao');
    form.append('name', 'Sem Sessão');
    form.append('categoryId', categoryId);
    form.append('tags', JSON.stringify([]));
    form.append('file', await pngComAlfa(), { filename: 'x.png', contentType: 'image/png' });
    const res = await app.inject({
      method: 'POST', url: `/packs/${packId}/stickers`,
      headers: { ...form.getHeaders() }, payload: form.getBuffer(),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /stickers/:id', () => {
  it('admin remove a figurinha', async () => {
    const cookie = await criarELogar('admin');
    const { packId, categoryId } = await criarPackComCategoria(cookie);
    await subirFigurinha(cookie, packId, categoryId, 'para-remover', await pngComAlfa());

    const res = await app.inject({
      method: 'DELETE', url: '/stickers/para-remover', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(await t.db.select().from(stickers)).toHaveLength(0);
  });

  it('recusa gerente sem pack.edit com 403', async () => {
    const admin = await criarELogar('admin');
    const { packId, categoryId } = await criarPackComCategoria(admin);
    await subirFigurinha(admin, packId, categoryId, 'protegida', await pngComAlfa());

    const gerente = await criarELogar('gerente', ['sticker.import']);
    const res = await app.inject({
      method: 'DELETE', url: '/stickers/protegida', headers: { cookie: gerente },
    });
    expect(res.statusCode).toBe(403);
  });

  it('recusa 401 sem sessão', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/stickers/qualquer' });
    expect(res.statusCode).toBe(401);
  });
});
