import { describe, it, expect } from 'vitest';
import { buildManifest } from '../../src/content/manifest.js';

const input = {
  packs: [{
    slug: 'harmonizacao', name: 'Harmonização', coverKey: 'packs/harmonizacao/cover.png',
    categories: [
      { id: 'c1', name: 'Setas', sortOrder: 0 },
      { id: 'c2', name: 'Frases', sortOrder: 1 },
    ],
    stickers: [
      { id: 'seta-reta', name: 'Seta reta', tags: ['seta'], fileKey: 'packs/harmonizacao/seta-reta.png', categoryId: 'c1', sortOrder: 0 },
      { id: 'resultado', name: 'Resultado', tags: ['frase'], fileKey: 'packs/harmonizacao/resultado.png', categoryId: 'c2', sortOrder: 0 },
    ],
  }],
};

describe('buildManifest', () => {
  it('produz o formato consumido pelo app', () => {
    const m = buildManifest(input, 3);
    expect(m.version).toBe(3);
    expect(m.packs[0]!.id).toBe('harmonizacao');
    expect(m.packs[0]!.cover).toBe('packs/harmonizacao/cover.png');
    expect(m.packs[0]!.free).toBe(true);
  });

  it('agrupa cada figurinha na categoria certa', () => {
    const m = buildManifest(input, 1);
    const [setas, frases] = m.packs[0]!.categories;
    expect(setas!.stickers.map((s) => s.id)).toEqual(['seta-reta']);
    expect(frases!.stickers.map((s) => s.id)).toEqual(['resultado']);
  });

  it('omite categoria sem figurinha', () => {
    const m = buildManifest({
      packs: [{ ...input.packs[0]!, stickers: [input.packs[0]!.stickers[0]!] }],
    }, 1);
    expect(m.packs[0]!.categories).toHaveLength(1);
  });

  it('omite pacote que ficou sem figurinha nenhuma', () => {
    const m = buildManifest({ packs: [{ ...input.packs[0]!, stickers: [] }] }, 1);
    expect(m.packs).toHaveLength(0);
  });
});
