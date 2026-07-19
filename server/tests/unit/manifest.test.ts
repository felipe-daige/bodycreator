import { describe, it, expect } from 'vitest';
import { buildManifest } from '../../src/content/manifest.js';

const input = {
  packs: [{
    slug: 'harmonizacao', name: 'Harmonização', description: 'Marcações para procedimentos',
    coverKey: 'packs/harmonizacao/cover.png', isFree: true, storeProductId: null,
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
    expect(m.packs[0]!.description).toBe('Marcações para procedimentos');
    expect(m.packs[0]!.productId).toBeNull();
  });

  it('publica o Product ID de um pacote pago sem inventar preço', () => {
    const m = buildManifest({
      packs: [{
        ...input.packs[0]!,
        isFree: false,
        storeProductId: 'com.daige.bodycreator.pack.harmonizacao',
      }],
    }, 1);
    expect(m.packs[0]!.free).toBe(false);
    expect(m.packs[0]!.productId).toBe('com.daige.bodycreator.pack.harmonizacao');
    expect(m.packs[0]).not.toHaveProperty('price');
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

  it('omite pacote cujo coverKey é nulo', () => {
    const m = buildManifest({ packs: [{ ...input.packs[0]!, coverKey: null }] }, 1);
    expect(m.packs).toHaveLength(0);
  });

  it('pacote completo aparece no manifesto com cover preenchido, nunca null', () => {
    const m = buildManifest(input, 1);
    expect(m.packs).toHaveLength(1);
    expect(m.packs[0]!.cover).toBe('packs/harmonizacao/cover.png');
    expect(typeof m.packs[0]!.cover).toBe('string');
  });
});
