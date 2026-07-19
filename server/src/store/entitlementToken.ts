import { createHmac, timingSafeEqual } from 'node:crypto';

export type EntitlementTokenPayload = {
  productId: string;
  expiresAt: number;
};

const TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;

export function createEntitlementToken(
  productId: string,
  secret: string,
  now = Date.now(),
): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS;
  const encoded = Buffer.from(JSON.stringify({ productId, expiresAt })).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return { token: `${encoded}.${signature}`, expiresAt };
}

export function verifyEntitlementToken(
  token: string,
  secret: string,
  now = Date.now(),
): EntitlementTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, suppliedSignature] = parts;
  if (!encoded || !suppliedSignature) return null;

  const expectedSignature = createHmac('sha256', secret).update(encoded).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedSignature, 'base64url');
  } catch {
    return null;
  }
  if (supplied.length !== expectedSignature.length || !timingSafeEqual(supplied, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as Partial<EntitlementTokenPayload>;
    if (typeof payload.productId !== 'string' || typeof payload.expiresAt !== 'number') return null;
    if (!Number.isInteger(payload.expiresAt) || payload.expiresAt <= Math.floor(now / 1000)) return null;
    return { productId: payload.productId, expiresAt: payload.expiresAt };
  } catch {
    return null;
  }
}
