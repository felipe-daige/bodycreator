import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { Config } from '../config.js';
import type { Storage } from './index.js';

/**
 * O ponteiro para a versão corrente do catálogo (`catalog/current.json`) muda
 * a cada publicação e a cada rollback — precisa de cache curto. Todo o resto
 * sob `catalog/` (manifestos versionados) e `packs/` (figurinhas) é imutável
 * por conteúdo e pode ficar em cache para sempre.
 */
export function isMutablePointer(key: string): boolean {
  return key === 'catalog/current.json';
}

function cacheControlFor(key: string): string {
  if (isMutablePointer(key)) return 'public, max-age=60, must-revalidate';
  if (key.startsWith('catalog/') || key.startsWith('packs/')) return 'public, max-age=31536000, immutable';
  return 'public, max-age=31536000';
}

/**
 * Distingue "objeto não existe" (404 legítimo, deve virar null) de qualquer
 * outro erro (credencial inválida, rede fora, etc.), que precisa propagar
 * para quem chamou decidir o que fazer — nunca deve ser mascarado como um
 * simples "não encontrado".
 */
export function isNotFoundError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const name = (err as { name?: unknown }).name;
  if (name === 'NoSuchKey' || name === 'NotFound') return true;
  const metadata = (err as { $metadata?: unknown }).$metadata;
  if (typeof metadata === 'object' && metadata !== null) {
    const status = (metadata as { httpStatusCode?: unknown }).httpStatusCode;
    if (status === 404) return true;
  }
  return false;
}

export function createR2Storage(config: Config): Storage {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
  });

  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({
        Bucket: config.R2_BUCKET, Key: key, Body: body, ContentType: contentType,
        CacheControl: cacheControlFor(key),
      }));
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: config.R2_BUCKET, Key: key }));
        return Buffer.from(await res.Body!.transformToByteArray());
      } catch (err) {
        if (isNotFoundError(err)) return null;
        throw err;
      }
    },
  };
}
