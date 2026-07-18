import { createHash } from 'node:crypto';
import sharp from 'sharp';

export const MAX_BYTES = 2 * 1024 * 1024;
export const MIN_LONGEST_SIDE = 512;
export const MAX_LONGEST_SIDE = 2048;

export type PngValidation =
  | { ok: true; width: number; height: number; bytes: number; checksum: string }
  | { ok: false; error: string };

export async function validatePng(buffer: Buffer): Promise<PngValidation> {
  if (buffer.length === 0) {
    return { ok: false, error: 'O arquivo está vazio.' };
  }
  if (buffer.length > MAX_BYTES) {
    return { ok: false, error: 'A figurinha passa de 2 MB. Exporte com menos peso.' };
  }

  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    // Arquivo corrompido ou truncado cai aqui. Vira recusa em pt-BR, nunca 500.
    return { ok: false, error: 'O arquivo não é um PNG válido.' };
  }

  if (meta.format !== 'png') {
    return { ok: false, error: 'O arquivo precisa ser PNG.' };
  }
  if (!meta.hasAlpha) {
    return { ok: false, error: 'O PNG precisa ter fundo transparente (canal alfa).' };
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const longest = Math.max(width, height);
  if (longest < MIN_LONGEST_SIDE) {
    return { ok: false, error: `O maior lado precisa ter ao menos ${MIN_LONGEST_SIDE} px (tem ${longest} px).` };
  }
  if (longest > MAX_LONGEST_SIDE) {
    return { ok: false, error: `O maior lado precisa ter no máximo ${MAX_LONGEST_SIDE} px (tem ${longest} px).` };
  }

  return {
    ok: true, width, height, bytes: buffer.length,
    checksum: createHash('sha256').update(buffer).digest('hex'),
  };
}
