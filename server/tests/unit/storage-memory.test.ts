import { describe, it, expect } from 'vitest';
import { createMemoryStorage } from '../../src/storage/memory.js';
import { createR2Storage, isMutablePointer, isNotFoundError } from '../../src/storage/r2.js';
import { loadConfig } from '../../src/config.js';

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

  it('não gera barra dupla quando a base termina com "/"', () => {
    const s = createMemoryStorage('https://cdn.exemplo.com/');
    expect(s.publicUrl('catalog/v3.json')).toBe('https://cdn.exemplo.com/catalog/v3.json');
  });
});

describe('isMutablePointer', () => {
  it('reconhece o ponteiro corrente como mutável', () => {
    expect(isMutablePointer('catalog/current.json')).toBe(true);
  });

  it('trata manifestos versionados como imutáveis', () => {
    expect(isMutablePointer('catalog/v1.json')).toBe(false);
    expect(isMutablePointer('catalog/v42.json')).toBe(false);
  });

  it('trata figurinhas em packs/ como imutáveis', () => {
    expect(isMutablePointer('packs/harmonizacao/seta-reta.png')).toBe(false);
  });
});

describe('isNotFoundError', () => {
  it('reconhece erro NoSuchKey do AWS SDK v3 pelo nome', () => {
    expect(isNotFoundError({ name: 'NoSuchKey', message: 'The specified key does not exist.' })).toBe(true);
  });

  it('reconhece erro NotFound do AWS SDK v3 pelo nome', () => {
    expect(isNotFoundError({ name: 'NotFound', message: 'Not Found' })).toBe(true);
  });

  it('reconhece 404 pelo $metadata.httpStatusCode mesmo sem nome reconhecido', () => {
    expect(isNotFoundError({ name: 'UnknownError', $metadata: { httpStatusCode: 404 } })).toBe(true);
  });

  it('não trata erro de credencial inválida como 404', () => {
    expect(isNotFoundError({ name: 'CredentialsProviderError', message: 'Could not load credentials' })).toBe(false);
  });

  it('não trata erro de rede/timeout como 404', () => {
    expect(isNotFoundError(new Error('ECONNREFUSED'))).toBe(false);
  });

  it('não trata 500 do servidor como 404', () => {
    expect(isNotFoundError({ name: 'InternalError', $metadata: { httpStatusCode: 500 } })).toBe(false);
  });

  it('lida com valores que não são objetos de erro', () => {
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
    expect(isNotFoundError('falha genérica')).toBe(false);
  });
});

describe('r2 storage publicUrl', () => {
  const baseConfig = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://x/x',
    SESSION_SECRET: 'x'.repeat(32),
    PUBLIC_PANEL_ORIGIN: 'http://localhost:5173',
    R2_ACCOUNT_ID: 'x',
    R2_ACCESS_KEY_ID: 'x',
    R2_SECRET_ACCESS_KEY: 'x',
    R2_BUCKET: 'x',
    MAIL_FROM: 'nao-responda@example.com',
  };

  it('monta a URL correta quando a base não termina com "/"', () => {
    const config = loadConfig({ ...baseConfig, R2_PUBLIC_BASE_URL: 'https://cdn.exemplo.com' });
    const s = createR2Storage(config);
    expect(s.publicUrl('catalog/v3.json')).toBe('https://cdn.exemplo.com/catalog/v3.json');
  });

  it('não gera barra dupla quando a base termina com "/"', () => {
    const config = loadConfig({ ...baseConfig, R2_PUBLIC_BASE_URL: 'https://cdn.exemplo.com/' });
    const s = createR2Storage(config);
    expect(s.publicUrl('catalog/v3.json')).toBe('https://cdn.exemplo.com/catalog/v3.json');
  });
});
