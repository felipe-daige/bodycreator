import type { FastifyInstance, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { packs } from '../db/schema.js';
import { verifyEntitlementToken } from '../store/entitlementToken.js';

const pointerSchema = z.object({
  version: z.number().int().positive(),
  checksum: z.string().min(1),
});

const versionSchema = z.coerce.number().int().positive();

export async function catalogRoutes(app: FastifyInstance) {
  app.get('/catalog/current', async (_request, reply) => {
    const pointer = await app.deps.storage.get('catalog/current.json');
    if (!pointer) {
      return reply.code(404).send({ error: 'O catálogo ainda não foi publicado.' });
    }

    let parsed;
    try {
      parsed = pointerSchema.parse(JSON.parse(pointer.toString()));
    } catch {
      return reply.code(500).send({ error: 'O catálogo publicado está inválido.' });
    }

    // As URLs são relativas à API. Assim o R2 pode permanecer privado e o
    // app nunca recebe um endereço que contorne a validação de compra.
    return reply
      .header('Cache-Control', 'public, max-age=60, must-revalidate')
      .send({
        version: parsed.version,
        manifest: `/catalog/manifests/${parsed.version}`,
        assets: '/catalog/assets',
        checksum: parsed.checksum,
      });
  });

  app.get('/catalog/manifests/:version', async (request, reply) => {
    const parsed = versionSchema.safeParse((request.params as { version: string }).version);
    if (!parsed.success) return reply.code(400).send({ error: 'Versão de catálogo inválida.' });

    const manifest = await app.deps.storage.get(`catalog/v${parsed.data}.json`);
    if (!manifest) return reply.code(404).send({ error: 'Essa versão do catálogo não existe.' });
    return reply
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .type('application/json')
      .send(manifest);
  });

  app.get('/catalog/assets/*', async (request, reply) => {
    const key = (request.params as { '*': string })['*'];
    if (!isSafeAssetKey(key)) {
      return reply.code(400).send({ error: 'Caminho de arquivo inválido.' });
    }

    const [, slug, fileName] = key.split('/');
    const [pack] = await app.deps.db.select({
      isFree: packs.isFree,
      storeProductId: packs.storeProductId,
    }).from(packs).where(eq(packs.slug, slug!)).limit(1);
    if (!pack) return reply.code(404).send({ error: 'Pacote não encontrado.' });

    // Capas formam a vitrine e são públicas, inclusive as capas antigas que
    // manifestos imutáveis ainda referenciam depois de uma substituição.
    if (fileName === 'cover.png' || fileName?.startsWith('cover-')) {
      return sendPng(app, reply, key, false);
    }

    if (!pack.isFree) {
      const authorization = request.headers.authorization;
      const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
      const entitlement = verifyEntitlementToken(
        token,
        app.deps.config.SESSION_SECRET,
      );
      if (!entitlement || entitlement.productId !== pack.storeProductId) {
        return reply.code(403).send({ error: 'Compre ou restaure este pacote para baixar a figurinha.' });
      }
    }

    return sendPng(app, reply, key, !pack.isFree);
  });
}

function isSafeAssetKey(key: string): boolean {
  const parts = key.split('/');
  return parts.length === 3 && parts[0] === 'packs' && parts[1] !== '' &&
    !key.includes('..') && !key.includes('\\') && key.endsWith('.png');
}

async function sendPng(
  app: FastifyInstance,
  reply: FastifyReply,
  key: string,
  privateContent: boolean,
) {
  const bytes = await app.deps.storage.get(key);
  if (!bytes) return reply.code(404).send({ error: 'Arquivo não encontrado.' });
  if (privateContent) {
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    reply.header('Vary', 'Authorization');
  } else {
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
  }
  return reply.type('image/png').send(bytes);
}
