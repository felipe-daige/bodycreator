import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq, desc, asc } from 'drizzle-orm';
import { z } from 'zod';
import { packs, categories, stickers, catalogVersions } from '../db/schema.js';
import { requireAuth, requirePermission } from '../auth/guards.js';
import { buildManifest, type ManifestInput } from '../content/manifest.js';
import { recordAudit } from '../audit.js';

export async function publishRoutes(app: FastifyInstance) {
  const { db, storage } = app.deps;

  app.get('/publish/versions', { preHandler: requireAuth }, async () =>
    db.select().from(catalogVersions).orderBy(desc(catalogVersions.version)));

  app.post('/publish', {
    preHandler: [requireAuth, requirePermission('pack.publish')],
  }, async (request, reply) => {
    // Sem ORDER BY o retorno do SELECT não é determinístico e o sortOrder do
    // pacote fica morto — a ordem do manifesto mudaria de publicação para
    // publicação sem nenhuma mudança de dado.
    const publicados = await db.select().from(packs).where(eq(packs.status, 'published'))
      .orderBy(asc(packs.sortOrder), asc(packs.slug));
    const input: ManifestInput = { packs: [] };

    for (const pack of publicados) {
      input.packs.push({
        slug: pack.slug,
        name: pack.name,
        description: pack.description,
        coverKey: pack.coverKey,
        isFree: pack.isFree,
        storeProductId: pack.storeProductId,
        categories: await db.select().from(categories).where(eq(categories.packId, pack.id)),
        stickers: await db.select().from(stickers).where(eq(stickers.packId, pack.id)),
      });
    }

    const [ultima] = await db.select().from(catalogVersions)
      .orderBy(desc(catalogVersions.version)).limit(1);
    const version = (ultima?.version ?? 0) + 1;

    const manifest = buildManifest(input, version);
    const body = Buffer.from(JSON.stringify(manifest, null, 2));
    const manifestKey = `catalog/v${version}.json`;
    const checksum = createHash('sha256').update(body).digest('hex');

    // O manifesto versionado é imutável; só o ponteiro muda.
    await storage.put(manifestKey, body, 'application/json');

    await db.transaction(async (tx) => {
      await tx.update(catalogVersions).set({ isCurrent: false })
        .where(eq(catalogVersions.isCurrent, true));
      await tx.insert(catalogVersions).values({
        version, manifestKey, checksum,
        publishedBy: request.currentUser!.id, isCurrent: true,
      });
    });

    await storage.put(
      'catalog/current.json',
      Buffer.from(JSON.stringify({ version, manifestKey, checksum })),
      'application/json',
    );

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'catalog.publish',
      entityType: 'catalog', entityId: String(version),
      payload: { version, packs: manifest.packs.length },
    });

    return reply.code(201).send({ version, url: `/catalog/manifests/${version}`, checksum });
  });

  app.post('/publish/rollback', {
    preHandler: [requireAuth, requirePermission('pack.publish')],
  }, async (request, reply) => {
    const parsed = z.object({ version: z.number().int().positive() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Versão inválida.' });

    const [alvo] = await db.select().from(catalogVersions)
      .where(eq(catalogVersions.version, parsed.data.version)).limit(1);
    if (!alvo) return reply.code(404).send({ error: 'Essa versão do catálogo não existe.' });

    // Rollback é trocar o ponteiro. Nenhum manifesto é apagado ou reescrito.
    await db.transaction(async (tx) => {
      await tx.update(catalogVersions).set({ isCurrent: false })
        .where(eq(catalogVersions.isCurrent, true));
      await tx.update(catalogVersions).set({ isCurrent: true })
        .where(eq(catalogVersions.version, alvo.version));
    });

    await storage.put(
      'catalog/current.json',
      Buffer.from(JSON.stringify({
        version: alvo.version,
        manifestKey: alvo.manifestKey,
        checksum: alvo.checksum,
      })),
      'application/json',
    );

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'catalog.rollback',
      entityType: 'catalog', entityId: String(alvo.version),
    });
    return { version: alvo.version };
  });
}
