import { neon } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';

type MemoryEntry = { value: string; expiresAt: number | null };

type BlobKvGlobal = typeof globalThis & {
  __lawdiplomaKv?: Map<string, MemoryEntry>;
  __lawdiplomaRedis?: Redis | null;
};

const globalRef = globalThis as BlobKvGlobal;
let neonClient: ReturnType<typeof neon> | null = null;

function memory(): Map<string, MemoryEntry> {
  if (!globalRef.__lawdiplomaKv) globalRef.__lawdiplomaKv = new Map();
  return globalRef.__lawdiplomaKv;
}

function getNeon() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (!neonClient) neonClient = neon(url);
  return neonClient;
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

export function isKvConfigured(): boolean {
  const { url, token } = redisCredentials();
  return Boolean(process.env.DATABASE_URL?.trim() || (url && token));
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

/** قراءة نص خام من Neon أو Redis أو Private Blob. */
export async function kvGetRaw(key: string): Promise<string | null> {
  const sql = getNeon();
  if (sql) {
    const rows = (await sql`
      SELECT value
      FROM public.lawdiploma_kv
      WHERE key = ${key}
        AND (expires_at IS NULL OR expires_at > now())
      LIMIT 1
    `) as unknown as Array<{ value: string }>;
    return typeof rows[0]?.value === 'string' ? rows[0].value : null;
  }

  const redis = getRedis();
  if (redis) {
    const value = await redis.get<string>(key);
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? value : JSON.stringify(value);
  }



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
  const sql = getNeon();
  if (sql) {
    if (ttlSeconds && ttlSeconds > 0) {
      await sql`
        INSERT INTO public.lawdiploma_kv (key, value, expires_at, updated_at)
        VALUES (${key}, ${value}, now() + (${ttlSeconds} * interval '1 second'), now())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            expires_at = EXCLUDED.expires_at,
            updated_at = now()
      `;
    } else {
      await sql`
        INSERT INTO public.lawdiploma_kv (key, value, expires_at, updated_at)
        VALUES (${key}, ${value}, NULL, now())
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            expires_at = NULL,
            updated_at = now()
      `;
    }
    return;
  }

  const redis = getRedis();
  if (redis) {
    if (ttlSeconds) await redis.set(key, value, { ex: ttlSeconds });
    else await redis.set(key, value);
    return;
  }



  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Persistent storage is not configured. Connect Neon, a private Vercel Blob store, or Upstash Redis before saving data.',
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
  const sql = getNeon();
  if (sql) {
    await sql`DELETE FROM public.lawdiploma_kv WHERE key = ${key}`;
    return;
  }

  const redis = getRedis();
  if (redis) {
    await redis.del(key);
    return;
  }



  if (process.env.NODE_ENV === 'production') {
    throw new Error('Persistent storage is not configured.');
  }
  memory().delete(key);
}

/** زيادة عدّاد المحاولات، مع الحفاظ على TTL وبعملية ذرية في قاعدة البيانات. */
export async function kvIncr(key: string, ttlSeconds: number): Promise<number> {
  const sql = getNeon();
  if (sql) {
    const rows = (await sql`
      INSERT INTO public.lawdiploma_kv (key, value, expires_at, updated_at)
      VALUES (${key}, '1', now() + (${ttlSeconds} * interval '1 second'), now())
      ON CONFLICT (key) DO UPDATE
      SET value = CASE
            WHEN public.lawdiploma_kv.expires_at IS NOT NULL
              AND public.lawdiploma_kv.expires_at <= now()
            THEN '1'
            ELSE (public.lawdiploma_kv.value::bigint + 1)::text
          END,
          expires_at = CASE
            WHEN public.lawdiploma_kv.expires_at IS NULL
              OR public.lawdiploma_kv.expires_at <= now()
            THEN now() + (${ttlSeconds} * interval '1 second')
            ELSE public.lawdiploma_kv.expires_at
          END,
          updated_at = now()
      RETURNING value
    `) as unknown as Array<{ value: string }>;
    return Number(rows[0]?.value ?? 1);
  }

  const redis = getRedis();
  if (redis) {
    const value = await redis.incr(key);
    if (value === 1) await redis.expire(key, ttlSeconds);
    return value;
  }



  const current = Number(readMemory(key) ?? '0') + 1;
  const existing = memory().get(key);
  memory().set(key, {
    value: String(current),
    expiresAt: existing?.expiresAt ?? Date.now() + ttlSeconds * 1000,
  });
  return current;
}
