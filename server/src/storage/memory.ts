import type { Storage } from './index.js';

export function createMemoryStorage(baseUrl = 'https://cdn.test') {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const storage: Storage & { objects: typeof objects } = {
    objects,
    async put(key, body, contentType) { objects.set(key, { body, contentType }); },
    async get(key) { return objects.get(key)?.body ?? null; },
    publicUrl(key) { return `${baseUrl.replace(/\/$/, '')}/${key}`; },
  };
  return storage;
}
