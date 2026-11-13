import { Redis } from '@upstash/redis';
import { del as deleteBlob, get as getBlob, put } from '@vercel/blob';

type MemoryEntry = { value: string; expiresAt: number | null };
type BlobEntry = { value: string; expiresAt: number | null };

type BlobKvGlobal = typeof globalThis & {
  __lawdiplomaKv?: Map<string, MemoryEntry>;
  __lawdiplomaRedis?: Redis | null;
};

const globalRef = globalThis as BlobKvGlobal;
const BLOB_PREFIX = 'lawdiploma-kv';

function memory(): Map<string, MemoryEntry> {
  if (!globalRef.__lawdiplomaKv) globalRef.__lawdiplomaKv = new Map();
  return globalRef.__lawdiplomaKv;
}

function redisCredentials() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_URL ||
    '';
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_TOKEN ||
    '';
  return { url: url.trim(), token: token.trim() };
}

function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function blobPath(key: string): string {
  return `${BLOB_PREFIX}/${Buffer.from(key, 'utf8').toString('base64url')}.json`;
}

export function isKvConfigured(): boolean {
  const { url, token } = redisCredentials();
  return Boolean((url && token) || hasBlobToken());
}

function getRedis(): Redis | null {
  if (globalRef.__lawdiplomaRedis) return globalRef.__lawdiplomaRedis;
  const { url, token } = redisCredentials();
  if (!url || !token) return null;
  const client = new Redis({ url, token, automaticDeserialization: false });
  globalRef.__lawdiplomaRedis = client;
  return client;
}

function readMemory(key: string): string | null {
  const entry = memory().get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    memory().delete(key);
    return null;
  }
  return entry.value;
}

async function readBlobEntry(
  key: string,
): Promise<{ entry: BlobEntry; etag: string } | null> {
  const pathname = blobPath(key);
  const result = await getBlob(pathname, {
    access: 'private',
    useCache: false,
  });

  if (!result) return null;
  if (result.statusCode !== 200 || !result.stream) {
    throw new Error(`Unexpected response while reading persistent key "${key}".`);
  }

  const raw = await new Response(result.stream).text();
  let entry: unknown;
  try {
    entry = JSON.parse(raw);
  } catch {
    throw new Error(`Persistent value for "${key}" is not valid JSON.`);
  }

  if (
    typeof entry !== 'object' ||
    entry === null ||
    typeof (entry as BlobEntry).value !== 'string' ||
    !(
      (entry as BlobEntry).expiresAt === null ||
      typeof (entry as BlobEntry).expiresAt === 'number'
    )
  ) {
    throw new Error(`Persistent value for "${key}" has an invalid shape.`);
  }

  const typed = entry as BlobEntry;
  if (typed.expiresAt !== null && typed.expiresAt <= Date.now()) {
    await deleteBlob(pathname, {
      access: 'private',
      ifMatch: result.blob.etag,
    });
    return null;
  }

  return { entry: typed, etag: result.blob.etag };
}

async function writeBlobEntry(
  key: string,
  entry: BlobEntry,
  etag?: string,
): Promise<void> {
  await put(blobPath(key), JSON.stringify(entry), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    ...(etag ? { ifMatch: etag } : {}),
  });
}

/** قراءة نص خام من Redis أو Private Blob. */
export async function kvGetRaw(key: string): Promise<string | null> {
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<string>(key);
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  if (hasBlobToken()) {
    const record = await readBlobEntry(key);
    return record?.entry.value ?? null;
  }

  // Keep only the login throttle best-effort in memory if persistent storage
  // has not been connected. Site data and admin credentials are never read
  // from per-instance memory in production.
  if (
    process.env.NODE_ENV === 'production' &&
    key.startsWith('lawdiploma:login-attempts:')
  ) {
    return readMemory(key);
  }

  if (process.env.NODE_ENV === 'production') return null;
  return readMemory(key);
}

/** كتابة نص خام، مع TTL اختياري بالثواني. */
export async function kvSetRaw(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    if (ttlSeconds) await redis.set(key, value, { ex: ttlSeconds });
    else await redis.set(key, value);
    return;
  }

  if (hasBlobToken()) {
    await writeBlobEntry(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Persistent storage is not configured. Connect a private Vercel Blob store or Upstash Redis before saving data.',
    );
  }

  memory().set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

/** قراءة JSON */
export async function kvGetJson<T>(key: string): Promise<T | null> {
  const raw = await kvGetRaw(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** كتابة JSON */
export async function kvSetJson(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<void> {
  await kvSetRaw(key, JSON.stringify(value), ttlSeconds);
}

/** حذف مفتاح */
export async function kvDel(key: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.del(key);
    return;
  }

  if (hasBlobToken()) {
    const record = await readBlobEntry(key);
    if (record) {
      await deleteBlob(blobPath(key), {
        access: 'private',
        ifMatch: record.etag,
      });
    }
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Persistent storage is not configured.');
  }
  memory().delete(key);
}

/** زيادة عدّاد المحاولات، مع الحفاظ على TTL. */
export async function kvIncr(key: string, ttlSeconds: number): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const value = await redis.incr(key);
    if (value === 1) await redis.expire(key, ttlSeconds);
    return value;
  }

  if (hasBlobToken()) {
    // Optimistic concurrency avoids dropping simultaneous increments.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const previous = await readBlobEntry(key);
      const current = Number(previous?.entry.value ?? '0') + 1;
      const expiresAt =
        previous?.entry.expiresAt ?? Date.now() + ttlSeconds * 1000;

      try {
        await writeBlobEntry(
          key,
          { value: String(current), expiresAt },
          previous?.etag,
        );
        return current;
      } catch (error) {
        if (attempt === 4) throw error;
      }
    }
    throw new Error('Could not update the persistent rate-limit counter.');
  }

  const current = Number(readMemory(key) ?? '0') + 1;
  const existing = memory().get(key);
  memory().set(key, {
    value: String(current),
    expiresAt: existing?.expiresAt ?? Date.now() + ttlSeconds * 1000,
  });
  return current;
}
