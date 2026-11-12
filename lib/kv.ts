import { Redis } from '@upstash/redis';

/**
 * طبقة تخزين بسيطة:
 *  - في الإنتاج (Vercel) بتستخدم Upstash Redis / Vercel KV (REST).
 *  - محلياً من غير أي متغيرات بيئة، بتشتغل في الذاكرة عشان تقدر تجرب بسرعة.
 *
 * المتغيرات المدعومة:
 *   KV_REST_API_URL      + KV_REST_API_TOKEN        (Vercel KV / Upstash من Vercel)
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (Upstash مباشرة)
 */

type MemoryEntry = { value: string; expiresAt: number | null };

type KvGlobal = typeof globalThis & {
  __lawdiplomaKv?: Map<string, MemoryEntry>;
  __lawdiplomaRedis?: Redis | null;
};

const globalRef = globalThis as KvGlobal;

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

export function isKvConfigured(): boolean {
  const { url, token } = redisCredentials();
  return Boolean(url && token);
}

function getRedis(): Redis | null {
  if (!isKvConfigured()) return null;
  if (globalRef.__lawdiplomaRedis) return globalRef.__lawdiplomaRedis;
  const { url, token } = redisCredentials();
  const client = new Redis({ url, token, automaticDeserialization: false });
  globalRef.__lawdiplomaRedis = client;
  return client;
}

function readMemory(key: string): string | null {
  const entry = memory().get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
    memory().delete(key);
    return null;
  }
  return entry.value;
}

/** قراءة نص خام */
export async function kvGetRaw(key: string): Promise<string | null> {
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<string>(key);
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return readMemory(key);
}

/** كتابة نص خام، مع TTL اختياري بالثواني */
export async function kvSetRaw(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const redis = getRedis();
  if (redis) {
    if (ttlSeconds) await redis.set(key, value, { ex: ttlSeconds });
    else await redis.set(key, value);
    return;
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
export async function kvSetJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  await kvSetRaw(key, JSON.stringify(value), ttlSeconds);
}

/** حذف مفتاح */
export async function kvDel(key: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.del(key);
    return;
  }
  memory().delete(key);
}

/** زيادة عدّاد، وبيرجع القيمة الجديدة */
export async function kvIncr(key: string, ttlSeconds: number): Promise<number> {
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
