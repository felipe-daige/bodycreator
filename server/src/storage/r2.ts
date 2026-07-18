import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { Config } from '../config.js';
import type { Storage } from './index.js';

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
        // Manifesto é imutável por versão, então pode ficar em cache para sempre.
        CacheControl: key.startsWith('catalog/') ? 'public, max-age=31536000, immutable' : 'public, max-age=31536000',
      }));
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: config.R2_BUCKET, Key: key }));
        return Buffer.from(await res.Body!.transformToByteArray());
      } catch {
        return null;
      }
    },
    publicUrl(key) {
      return `${config.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
    },
  };
}
