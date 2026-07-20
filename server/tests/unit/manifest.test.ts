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

describe('buildManifest storefront', () => {
  const dois = {
    packs: [
      { ...input.packs[0]!, slug: 'pack-a' },
      { ...input.packs[0]!, slug: 'pack-b' },
    ],
  };

  it('sem rascunho: sintetiza seção única "Pacotes" na ordem dos packs', () => {
    const m = buildManifest(dois, 1);
    expect(m.storefront.hero).toBeNull();
    expect(m.storefront.sections).toEqual([
      { id: 'todos', title: 'Pacotes', packs: ['pack-a', 'pack-b'] },
    ]);
  });

  it('cura seções, filtra slug inexistente e descarta seção vazia', () => {
    const m = buildManifest(dois, 1, {
      hero: 'pack-a',
      sections: [
        { id: 's1', title: 'Novidades', packs: ['pack-b', 'fantasma'] },
        { id: 's2', title: 'Vazia', packs: ['fantasma'] },
      ],
    });
    expect(m.storefront.hero).toBe('pack-a');
    expect(m.storefront.sections).toEqual([
      { id: 's1', title: 'Novidades', packs: ['pack-b'] },
    ]);
  });

  it('herói não publicado vira null', () => {
    const m = buildManifest(dois, 1, { hero: 'fantasma', sections: [] });
    expect(m.storefront.hero).toBeNull();
  });

  it('packs não atribuídos caem em "Mais pacotes" (exceto o herói)', () => {
    const m = buildManifest(dois, 1, {
      hero: 'pack-a',
      sections: [{ id: 's1', title: 'Novidades', packs: [] }],
    });
    expect(m.storefront.sections).toEqual([
      { id: 'mais-pacotes', title: 'Mais pacotes', packs: ['pack-b'] },
    ]);
  });
});
