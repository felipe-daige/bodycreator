import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDb } from '../setup/db.js';
import { stickers, packs, categories, users } from '../../src/db/schema.js';

const t = withTestDb();

describe('esquema', () => {
  it('impede duas figurinhas com o mesmo id em pacotes diferentes', async () => {
    const [autor] = await t.db.insert(users).values({
      email: 'a@x.com', name: 'A', passwordHash: 'h', role: 'admin',
    }).returning();

    const [p1] = await t.db.insert(packs).values({
      slug: 'pack-um', name: 'Pack Um', authorName: 'A', createdBy: autor!.id,
    }).returning();
    const [p2] = await t.db.insert(packs).values({
      slug: 'pack-dois', name: 'Pack Dois', authorName: 'A', createdBy: autor!.id,
    }).returning();

    const [c1] = await t.db.insert(categories).values({ packId: p1!.id, name: 'C' }).returning();
    const [c2] = await t.db.insert(categories).values({ packId: p2!.id, name: 'C' }).returning();

    await t.db.insert(stickers).values({
      id: 'seta-reta', packId: p1!.id, categoryId: c1!.id, name: 'Seta',
      fileKey: 'k1', width: 1024, height: 1024, bytes: 100, checksum: 'x',
    });

    await expect(
      t.db.insert(stickers).values({
        id: 'seta-reta', packId: p2!.id, categoryId: c2!.id, name: 'Seta',
        fileKey: 'k2', width: 1024, height: 1024, bytes: 100, checksum: 'y',
      }),
    ).rejects.toThrow();
  });

  it('apaga as figurinhas junto com o pacote', async () => {
    const [autor] = await t.db.insert(users).values({
      email: 'b@x.com', name: 'B', passwordHash: 'h', role: 'admin',
    }).returning();
    const [p] = await t.db.insert(packs).values({
      slug: 'pack-tres', name: 'Pack Três', authorName: 'B', createdBy: autor!.id,
    }).returning();
    const [c] = await t.db.insert(categories).values({ packId: p!.id, name: 'C' }).returning();
    await t.db.insert(stickers).values({
      id: 'circulo', packId: p!.id, categoryId: c!.id, name: 'Círculo',
      fileKey: 'k', width: 512, height: 512, bytes: 100, checksum: 'z',
    });

    await t.db.delete(packs).where(eq(packs.id, p!.id));
    expect(await t.db.select().from(stickers)).toHaveLength(0);
  });
});
