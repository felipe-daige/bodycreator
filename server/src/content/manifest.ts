export type ManifestInput = {
  packs: Array<{
    slug: string;
    name: string;
    coverKey: string | null;
    categories: Array<{ id: string; name: string; sortOrder: number }>;
    stickers: Array<{
      id: string; name: string; tags: string[];
      fileKey: string; categoryId: string; sortOrder: number;
    }>;
  }>;
};

export type Manifest = {
  version: number;
  packs: Array<{
    id: string; name: string; cover: string; free: boolean;
    categories: Array<{
      id: string; name: string;
      stickers: Array<{ id: string; name: string; tags: string[]; file: string }>;
    }>;
  }>;
};

// Mantém o formato de Content/manifest.json do MVP: o P2 troca a fonte sem
// reescrever os modelos do módulo Catalog no app.
export function buildManifest(input: ManifestInput, version: number): Manifest {
  // Defesa em profundidade: a rota de publish (packs.ts) já recusa publicar
  // um pacote sem capa, mas um estado ruim gravado direto no banco não pode
  // produzir um manifesto com `cover: null` — o modelo Swift StickerPack
  // declara `let cover: String`, não opcional, e um null ali quebra a
  // decodificação do catálogo inteiro no app.
  const comCapa = input.packs.filter(
    (pack): pack is typeof pack & { coverKey: string } => pack.coverKey !== null,
  );

  const packs = comCapa.map((pack) => {
    const categories = [...pack.categories]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        stickers: pack.stickers
          .filter((s) => s.categoryId === cat.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((s) => ({ id: s.id, name: s.name, tags: s.tags, file: s.fileKey })),
      }))
      // Categoria vazia no app vira um chip que não filtra nada.
      .filter((cat) => cat.stickers.length > 0);

    return {
      id: pack.slug, name: pack.name, cover: pack.coverKey,
      // free continua true no P1: preço entra no P3.
      free: true,
      categories,
    };
  }).filter((pack) => pack.categories.length > 0);

  return { version, packs };
}
