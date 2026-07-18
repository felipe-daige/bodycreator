import { describe, it, expect } from 'vitest';
import { validatePng } from '../../src/content/validatePng.js';
import { pngComAlfa, pngSemAlfa, jpegQualquer, pngTruncado } from '../fixtures/make-fixtures.js';

describe('validatePng', () => {
  it('aceita PNG com alfa dentro dos limites', async () => {
    const r = await validatePng(await pngComAlfa(1024, 1024));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.width).toBe(1024);
      expect(r.height).toBe(1024);
      expect(r.checksum).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('recusa arquivo sem canal alfa', async () => {
    const r = await validatePng(await pngSemAlfa());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/transparência|alfa/i);
  });

  it('recusa arquivo que não é PNG', async () => {
    const r = await validatePng(await jpegQualquer());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/PNG/);
  });

  it('recusa PNG truncado sem estourar', async () => {
    const r = await validatePng(await pngTruncado());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/PNG/);
  });

  it('recusa maior lado abaixo de 512', async () => {
    const r = await validatePng(await pngComAlfa(300, 300));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/512/);
  });

  it('recusa maior lado acima de 2048', async () => {
    const r = await validatePng(await pngComAlfa(2500, 800));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/2048/);
  });

  it('aceita nos extremos exatos da faixa', async () => {
    expect((await validatePng(await pngComAlfa(512, 300))).ok).toBe(true);
    expect((await validatePng(await pngComAlfa(2048, 300))).ok).toBe(true);
  });

  it('recusa acima de 2 MB', async () => {
    const grande = Buffer.concat([await pngComAlfa(), Buffer.alloc(2 * 1024 * 1024)]);
    const r = await validatePng(grande);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/2 MB/);
  });

  it('recusa buffer vazio', async () => {
    const r = await validatePng(Buffer.alloc(0));
    expect(r.ok).toBe(false);
  });
});
