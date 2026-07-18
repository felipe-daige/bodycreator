import { describe, it, expect } from 'vitest';
import { createMemoryStorage } from '../../src/storage/memory.js';

describe('memory storage', () => {
  it('devolve os mesmos bytes que recebeu, sem alterar nada', async () => {
    const s = createMemoryStorage();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    await s.put('packs/x/seta.png', bytes, 'image/png');
    expect(await s.get('packs/x/seta.png')).toEqual(bytes);
  });

  it('devolve null para chave inexistente', async () => {
    expect(await createMemoryStorage().get('não/existe.png')).toBeNull();
  });

  it('monta a URL pública a partir da chave', () => {
    const s = createMemoryStorage('https://cdn.exemplo.com');
    expect(s.publicUrl('catalog/v3.json')).toBe('https://cdn.exemplo.com/catalog/v3.json');
  });
});
