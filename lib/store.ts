import { kvGetJson, kvSetJson, kvDel } from './kv';
import { createDefaultSite } from './defaults';
import { normalizeSite } from './normalize';
import type { SiteData } from './types';

export const SITE_KEY = 'lawdiploma:site:v1';
export const AUTH_KEY = 'lawdiploma:auth:v1';

export type AuthRecord = {
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * قراءة بيانات الموقع من قاعدة البيانات المشتركة.
 * أول مرة (مفيش بيانات) بنزرع البيانات الافتراضية (seed).
 */
export async function getSite(): Promise<SiteData> {
  const stored = await kvGetJson<unknown>(SITE_KEY);
  if (stored) {
    const normalized = normalizeSite(stored);
    // نحافظ على تاريخ آخر تحديث المخزّن
    const rawUpdatedAt =
      typeof (stored as Record<string, unknown>).updatedAt === 'string'
        ? ((stored as Record<string, unknown>).updatedAt as string)
        : normalized.updatedAt;
    return { ...normalized, updatedAt: rawUpdatedAt };
  }

  const seeded = createDefaultSite();
  try {
    await kvSetJson(SITE_KEY, seeded);
  } catch {
    // لو التخزين مش متاح، بنكمل بالبيانات الافتراضية عشان الصفحة تفضل شغالة
  }
  return seeded;
}

/** حفظ بيانات الموقع بعد التأكد إن الأدمن مسجّل دخول */
export async function saveSite(input: unknown): Promise<SiteData> {
  const normalized = normalizeSite(input);
  await kvSetJson(SITE_KEY, normalized);
  return normalized;
}

export async function getAuth(): Promise<AuthRecord | null> {
  return kvGetJson<AuthRecord>(AUTH_KEY);
}

export async function setAuth(record: AuthRecord): Promise<void> {
  await kvSetJson(AUTH_KEY, record);
}

export async function clearAuth(): Promise<void> {
  await kvDel(AUTH_KEY);
}
