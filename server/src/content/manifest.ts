export type StorefrontConfig = {
  hero: string | null;
  sections: Array<{ id: string; title: string; packs: string[] }>;
};

export type ManifestInput = {
  packs: Array<{
    slug: string;
    name: string;
    description: string;
    coverKey: string | null;
    isFree: boolean;
    storeProductId: string | null;
    categories: Array<{ id: string; name: string; sortOrder: number }>;
    stickers: Array<{
      id: string; name: string; tags: string[];
      fileKey: string; categoryId: string; sortOrder: number;
    }>;
  }>;
};

export type Manifest = {
  version: number;
  storefront: StorefrontConfig;
  packs: Array<{
    id: string; name: string; description: string; cover: string;
    free: boolean; productId: string | null;
    categories: Array<{
      id: string; name: string;
      stickers: Array<{ id: string; name: string; tags: string[]; file: string }>;
    }>;
  }>;
};

// Mantém o formato de Content/manifest.json do MVP: o P2 troca a fonte sem
// reescrever os modelos do módulo Catalog no app.
export function buildManifest(
  input: ManifestInput,
  version: number,
  storefrontDraft?: StorefrontConfig | null,
): Manifest {
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
      id: pack.slug,
      name: pack.name,
      description: pack.description,
      cover: pack.coverKey,
      free: pack.isFree,
      productId: pack.isFree ? null : pack.storeProductId,
      categories,
    };
  }).filter((pack) => pack.categories.length > 0);

  return { version, storefront: buildStorefront(packs, storefrontDraft ?? null), packs };
}

// A vitrine do manifesto é derivada do rascunho + dos packs que sobreviveram à
// filtragem: nada de pacote publicado fica invisível (o resto vira "Mais
// pacotes"), e ids inexistentes/seções vazias somem.
function buildStorefront(
  packs: Manifest['packs'],
  draft: StorefrontConfig | null,
): StorefrontConfig {
  const orderedIds = packs.map((p) => p.id);
  const publicados = new Set(orderedIds);

  if (!draft || (draft.sections.length === 0 && !draft.hero)) {
    return orderedIds.length === 0
      ? { hero: null, sections: [] }
      : { hero: null, sections: [{ id: 'todos', title: 'Pacotes', packs: orderedIds }] };
  }

  const hero = draft.hero && publicados.has(draft.hero) ? draft.hero : null;

  const sections = draft.sections
    .map((s) => ({ id: s.id, title: s.title, packs: s.packs.filter((p) => publicados.has(p)) }))
    .filter((s) => s.packs.length > 0);

  const atribuidos = new Set<string>();
  if (hero) atribuidos.add(hero);
  for (const s of sections) for (const p of s.packs) atribuidos.add(p);

  const naoAtribuidos = orderedIds.filter((id) => !atribuidos.has(id));
  if (naoAtribuidos.length > 0) {
    sections.push({ id: 'mais-pacotes', title: 'Mais pacotes', packs: naoAtribuidos });
  }
  return { hero, sections };
}
