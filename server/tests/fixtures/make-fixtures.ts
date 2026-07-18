import sharp from 'sharp';

export function pngComAlfa(width = 1024, height = 1024): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 200, g: 90, b: 156, alpha: 0.5 } },
  }).png().toBuffer();
}

export function pngSemAlfa(width = 1024, height = 1024): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 10, b: 10 } },
  }).png().toBuffer();
}

export function jpegQualquer(): Promise<Buffer> {
  return sharp({
    create: { width: 1024, height: 1024, channels: 3, background: { r: 1, g: 2, b: 3 } },
  }).jpeg().toBuffer();
}

export async function pngTruncado(): Promise<Buffer> {
  const inteiro = await pngComAlfa();
  return inteiro.subarray(0, 40);
}
