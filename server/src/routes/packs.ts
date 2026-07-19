import type { FastifyInstance } from 'fastify';
import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import { packs, categories, stickers, storeTransactions } from '../db/schema.js';
import { requireAuth, requirePermission } from '../auth/guards.js';
import { validatePng } from '../content/validatePng.js';
import { recordAudit } from '../audit.js';

const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const createSchema = z.object({
  slug: z.string().regex(slugRegex, 'O identificador aceita apenas letras minúsculas, números e hífen.'),
  name: z.string().min(2),
  description: z.string().default(''),
  authorName: z.string().min(2),
});

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isFree: z.boolean().optional(),
  storeProductId: z.string()
    .trim()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._-]{2,254}$/,
      'O ID do produto da App Store está inválido.',
    )
    .nullable()
    .optional(),
});

export async function packRoutes(app: FastifyInstance) {
  const { db, storage } = app.deps;

  app.get('/packs', { preHandler: requireAuth }, async () =>
    db.select().from(packs).orderBy(asc(packs.sortOrder), asc(packs.name)));

  app.get('/packs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [pack] = await db.select().from(packs).where(eq(packs.id, id)).limit(1);
    if (!pack) return reply.code(404).send({ error: 'Pacote não encontrado.' });
    const cats = await db.select().from(categories)
      .where(eq(categories.packId, id)).orderBy(asc(categories.sortOrder));
    const figs = await db.select().from(stickers)
      .where(eq(stickers.packId, id)).orderBy(asc(stickers.sortOrder));
    return { ...pack, categories: cats, stickers: figs };
  });

  app.post('/packs', {
    preHandler: [requireAuth, requirePermission('pack.create')],
  }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]!.message });
    }
    const [existe] = await db.select().from(packs)
      .where(eq(packs.slug, parsed.data.slug)).limit(1);
    if (existe) return reply.code(409).send({ error: 'Já existe um pacote com esse identificador.' });

    const [pack] = await db.insert(packs).values({
      ...parsed.data, createdBy: request.currentUser!.id,
    }).returning();

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'pack.create',
      entityType: 'pack', entityId: pack!.id, payload: { slug: pack!.slug },
    });
    return reply.code(201).send(pack);
  });

  app.patch('/packs/:id', {
    preHandler: [requireAuth, requirePermission('pack.edit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' });

    const [pack] = await db.select().from(packs).where(eq(packs.id, id)).limit(1);
    if (!pack) return reply.code(404).send({ error: 'Pacote não encontrado.' });

    const isFree = parsed.data.isFree ?? pack.isFree;
    const requestedProductId = parsed.data.storeProductId === undefined
      ? pack.storeProductId
      : parsed.data.storeProductId;
    const storeProductId = isFree ? null : requestedProductId;
    if (!isFree && !storeProductId) {
      return reply.code(400).send({
        error: 'Informe o ID do produto da App Store para tornar o pacote pago.',
      });
    }
    if (pack.storeProductId && storeProductId !== pack.storeProductId) {
      const [purchase] = await db.select({ id: storeTransactions.transactionId })
        .from(storeTransactions)
        .where(eq(storeTransactions.productId, pack.storeProductId))
        .limit(1);
      if (purchase) {
        return reply.code(409).send({
          error: 'Este pacote já possui compras e não pode trocar o ID do produto.',
        });
      }
    }
    if (storeProductId && storeProductId !== pack.storeProductId) {
      const [alreadyUsed] = await db.select({ id: packs.id }).from(packs)
        .where(eq(packs.storeProductId, storeProductId)).limit(1);
      if (alreadyUsed) {
        return reply.code(409).send({
          error: 'Esse ID de produto da App Store já está ligado a outro pacote.',
        });
      }
    }

    const update = {
      ...parsed.data,
      ...(parsed.data.isFree !== undefined || parsed.data.storeProductId !== undefined
        ? { storeProductId }
        : {}),
    };
    await db.update(packs).set(update).where(eq(packs.id, id));
    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'pack.update',
      entityType: 'pack', entityId: id, payload: { ...update },
    });
    return { ok: true };
  });

  app.post('/packs/:id/categories', {
    preHandler: [requireAuth, requirePermission('pack.edit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.object({
      name: z.string().min(2), sortOrder: z.number().int().default(0),
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nome da categoria inválido.' });

    const [pack] = await db.select().from(packs).where(eq(packs.id, id)).limit(1);
    if (!pack) return reply.code(404).send({ error: 'Pacote não encontrado.' });

    const [cat] = await db.insert(categories).values({ packId: id, ...parsed.data }).returning();
    return reply.code(201).send(cat);
  });

  // Nenhuma outra rota do sistema transiciona um pacote de draft para
  // published — o manifesto (buildManifest) só inclui pacotes published, e
  // publicar um pacote vazio ou sem capa sempre seria engano no app.
  // Mais barato bloquear aqui do que descobrir isso no app.
  app.post('/packs/:id/publish', {
    preHandler: [requireAuth, requirePermission('pack.publish')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [pack] = await db.select().from(packs).where(eq(packs.id, id)).limit(1);
    if (!pack) return reply.code(404).send({ error: 'Pacote não encontrado.' });

    const [algumaFigurinha] = await db.select().from(stickers)
      .where(eq(stickers.packId, id)).limit(1);
    if (!algumaFigurinha) {
      return reply.code(400).send({ error: 'Não é possível publicar um pacote sem nenhuma figurinha.' });
    }
    if (!pack.coverKey) {
      return reply.code(400).send({ error: 'Não é possível publicar um pacote sem capa.' });
    }
    if (!pack.isFree && !pack.storeProductId) {
      return reply.code(400).send({
        error: 'Defina o ID do produto da App Store antes de publicar um pacote pago.',
      });
    }

    await db.update(packs).set({ status: 'published', publishedAt: new Date() })
      .where(eq(packs.id, id));

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'pack.publish',
      entityType: 'pack', entityId: id, payload: { slug: pack.slug },
    });
    return { ok: true, status: 'published' };
  });

  app.post('/packs/:id/unpublish', {
    preHandler: [requireAuth, requirePermission('pack.publish')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [pack] = await db.select().from(packs).where(eq(packs.id, id)).limit(1);
    if (!pack) return reply.code(404).send({ error: 'Pacote não encontrado.' });

    await db.update(packs).set({ status: 'draft' }).where(eq(packs.id, id));

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'pack.unpublish',
      entityType: 'pack', entityId: id, payload: { slug: pack.slug },
    });
    return { ok: true, status: 'draft' };
  });

  app.post('/packs/:id/cover', {
    preHandler: [requireAuth, requirePermission('pack.edit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [pack] = await db.select().from(packs).where(eq(packs.id, id)).limit(1);
    if (!pack) return reply.code(404).send({ error: 'Pacote não encontrado.' });

    const parts = await request.saveRequestFiles({ limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
    const file = parts[0];
    if (!file) return reply.code(400).send({ error: 'Envie o arquivo PNG da capa.' });

    const buffer = await import('node:fs/promises').then((fs) => fs.readFile(file.filepath));
    const validation = await validatePng(buffer);
    if (!validation.ok) return reply.code(400).send({ error: validation.error });

    // O checksum entra na chave porque re-upload de capa é fluxo suportado: o
    // R2 serve tudo sob packs/ com cache immutable de 1 ano, então gravar nos
    // mesmos bytes sob a mesma chave nunca atualizaria atrás do CDN. Objetos
    // antigos ficam no R2 (nada os apaga), mas não são mais referenciados.
    const coverKey = `packs/${pack.slug}/cover-${validation.checksum.slice(0, 8)}.png`;
    // Os bytes originais vão inalterados: reencodar poderia perder o alfa.
    await storage.put(coverKey, buffer, 'image/png');

    await db.update(packs).set({ coverKey }).where(eq(packs.id, id));

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'pack.cover',
      entityType: 'pack', entityId: id, payload: { coverKey },
    });
    return { ok: true, coverKey };
  });
}
