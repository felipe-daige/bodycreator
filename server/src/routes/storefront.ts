import type { FastifyInstance } from 'fastify';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { storefront, packs } from '../db/schema.js';
import { requireAuth, requirePermission } from '../auth/guards.js';
import { recordAudit } from '../audit.js';

const configSchema = z.object({
  hero: z.string().min(1).nullable(),
  sections: z.array(z.object({
    id: z.string().min(1),
    title: z.string().trim().min(1),
    packs: z.array(z.string().min(1)),
  })),
});

export async function storefrontRoutes(app: FastifyInstance) {
  const { db } = app.deps;

  app.get('/storefront', {
    preHandler: [requireAuth, requirePermission('pack.publish')],
  }, async () => {
    const [row] = await db.select().from(storefront).limit(1);
    return row?.config ?? { hero: null, sections: [] };
  });

  app.put('/storefront', {
    preHandler: [requireAuth, requirePermission('pack.publish')],
  }, async (request, reply) => {
    const parsed = configSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Vitrine inválida.' });
    const config = parsed.data;

    const ids = config.sections.map((s) => s.id);
    if (new Set(ids).size !== ids.length) {
      return reply.code(400).send({ error: 'Há seções com o mesmo identificador.' });
    }

    // Todos os slugs referenciados (seções + herói) precisam existir: a vitrine
    // nunca deve gravar um ponteiro para um pacote que não está no catálogo.
    const referidos = new Set<string>(config.sections.flatMap((s) => s.packs));
    if (config.hero) referidos.add(config.hero);
    if (referidos.size > 0) {
      const existentes = await db.select({ slug: packs.slug }).from(packs)
        .where(inArray(packs.slug, [...referidos]));
      const set = new Set(existentes.map((p) => p.slug));
      const faltando = [...referidos].find((slug) => !set.has(slug));
      if (faltando) {
        return reply.code(400).send({ error: `Pacote inexistente na vitrine: ${faltando}` });
      }
    }

    await db.insert(storefront)
      .values({ id: 1, config, updatedBy: request.currentUser!.id, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: storefront.id,
        set: { config, updatedBy: request.currentUser!.id, updatedAt: new Date() },
      });

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'storefront.update',
      entityType: 'storefront', entityId: '1',
      payload: { sections: config.sections.length, hero: config.hero },
    });
    return config;
  });
}
