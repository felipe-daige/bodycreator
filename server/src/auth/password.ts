import { hash, verify } from '@node-rs/argon2';

const OPTIONS = {
  memoryCost: 19456, // 19 MiB — mínimo recomendado pela OWASP para Argon2id
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    // Hash malformado no banco não pode virar 500 na rota de login.
    return false;
  }
}
