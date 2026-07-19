import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { packs, categories, stickers } from '../db/schema.js';
import { requireAuth, requirePermission } from '../auth/guards.js';
import { validatePng } from '../content/validatePng.js';
import { recordAudit } from '../audit.js';

const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const stickerIdSchema = z.string()
  .regex(slugRegex, 'O id aceita apenas letras minúsculas, números e hífen.')
  // As capas usam `cover-<checksum>.png` e precisam ser públicas na vitrine.
  // Reservar esse prefixo impede que uma figurinha paga seja confundida com capa.
  .refine((id) => id !== 'cover' && !id.startsWith('cover-'), {
    message: 'O id da figurinha não pode usar o prefixo reservado "cover".',
  });

export async function stickerRoutes(app: FastifyInstance) {
  const { db, storage } = app.deps;

  app.post('/packs/:id/stickers', {
    preHandler: [requireAuth, requirePermission('sticker.import')],
  }, async (request, reply) => {
    const { id: packId } = request.params as { id: string };

    const [pack] = await db.select().from(packs).where(eq(packs.id, packId)).limit(1);
    if (!pack) return reply.code(404).send({ error: 'Pacote não encontrado.' });

    const parts = await request.saveRequestFiles({ limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
    const file = parts[0];
    if (!file) return reply.code(400).send({ error: 'Envie o arquivo PNG da figurinha.' });

    const fields = file.fields as Record<string, { value?: string } | undefined>;
    const meta = z.object({
      id: stickerIdSchema,
      name: z.string().min(1),
      categoryId: z.string().uuid(),
      tags: z.string().default('[]'),
    }).safeParse({
      id: fields.id?.value, name: fields.name?.value,
      categoryId: fields.categoryId?.value, tags: fields.tags?.value,
    });
    if (!meta.success) return reply.code(400).send({ error: meta.error.issues[0]!.message });

    // JSON.parse cru aceita qualquer JSON válido (ex.: "42", que não é lista
    // nenhuma) e qualquer entrada não-JSON vira exceção não tratada (500). O
    // app iOS decodifica tags como [String]; um valor não-array quebraria essa
    // decodificação assim que o manifesto fosse publicado.
    let tags: string[];
    try {
      const parsedTags: unknown = JSON.parse(meta.data.tags);
      if (!Array.isArray(parsedTags) || !parsedTags.every((tag) => typeof tag === 'string')) {
        throw new Error('tags não é uma lista de textos');
      }
      tags = parsedTags;
    } catch {
      return reply.code(400).send({ error: 'As tags precisam ser uma lista de textos.' });
    }

    const [cat] = await db.select().from(categories)
      .where(eq(categories.id, meta.data.categoryId)).limit(1);
    if (!cat || cat.packId !== packId) {
      return reply.code(400).send({ error: 'Categoria não pertence a este pacote.' });
    }

    // Checagem antes de gravar no storage: id duplicado corromperia os favoritos
    // de quem já usa o app, porque lá o id é gravado puro.
    const [jaExiste] = await db.select().from(stickers)
      .where(eq(stickers.id, meta.data.id)).limit(1);
    if (jaExiste) {
      return reply.code(409).send({ error: `Já existe uma figurinha com o id "${meta.data.id}".` });
    }

    const buffer = await import('node:fs/promises').then((fs) => fs.readFile(file.filepath));
    const validation = await validatePng(buffer);
    if (!validation.ok) return reply.code(400).send({ error: validation.error });

    // O checksum entra na chave porque apagar e recriar uma figurinha com o
    // mesmo id é fluxo suportado: sem isso os bytes mudariam sob a mesma
    // chave, e o cache immutable de 1 ano do R2 nunca atualizaria atrás do
    // CDN. Objetos antigos ficam no R2 (nada os apaga).
    const fileKey = `packs/${pack.slug}/${meta.data.id}-${validation.checksum.slice(0, 8)}.png`;
    // Os bytes originais vão inalterados: reencodar poderia perder o alfa.
    await storage.put(fileKey, buffer, 'image/png');

    const [sticker] = await db.insert(stickers).values({
      id: meta.data.id, packId, categoryId: meta.data.categoryId, name: meta.data.name,
      tags, fileKey,
      width: validation.width, height: validation.height,
      bytes: validation.bytes, checksum: validation.checksum,
    }).returning();

    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'sticker.import',
      entityType: 'sticker', entityId: sticker!.id, payload: { packId, fileKey },
    });
    return reply.code(201).send(sticker);
  });

  app.delete('/stickers/:id', {
    preHandler: [requireAuth, requirePermission('pack.edit')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [s] = await db.select().from(stickers).where(eq(stickers.id, id)).limit(1);
    if (!s) return reply.code(404).send({ error: 'Figurinha não encontrada.' });

    await db.delete(stickers).where(eq(stickers.id, id));
    // O objeto no R2 permanece: manifestos já publicados ainda o referenciam.
    await recordAudit(db, {
      actorId: request.currentUser!.id, action: 'sticker.delete',
      entityType: 'sticker', entityId: id, payload: { fileKey: s.fileKey },
    });
    return { ok: true };
  });
}
