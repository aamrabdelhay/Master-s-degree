import { kvGetJson, kvSetJson, kvDel } from './kv';
import { createDefaultSite, DEFAULT_EXECUTION_GROUPS } from './defaults';
import { normalizeSite } from './normalize';
import type { SiteData } from './types';

export const SITE_KEY = 'lawdiploma:site:v1';
export const AUTH_KEY = 'lawdiploma:auth:v1';

const EXECUTION_TOPICS_MIGRATION = 'execution-topics-order-v1';

function topicKey(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** تطبيق ترتيب موضوعات التنفيذ مرة واحدة مع إبقائها قابلة للتعديل من لوحة الأدمن. */
function migrateExecutionTopics(site: SiteData): SiteData {
  const migrations = site.migrations ?? [];
  if (migrations.includes(EXECUTION_TOPICS_MIGRATION)) return site;

  const subject =
    site.subjects.find((entry) => entry.name.includes('مرافعات')) ??
    site.subjects.find((entry) => entry.name.includes('التنفيذ الجبري'));
  if (!subject) return site;

  const knownTitles = new Set(DEFAULT_EXECUTION_GROUPS.map((group) => group.title));
  const knownTopics = new Set(
    DEFAULT_EXECUTION_GROUPS.flatMap((group) => group.items.map((item) => topicKey(item.text))),
  );

  const subjects = site.subjects.map((entry) => {
    if (entry.id !== subject.id) return entry;
    const remainingGroups = entry.groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !knownTopics.has(topicKey(item.text))),
      }))
      .filter((group) => !knownTitles.has(group.title) && group.items.length > 0);
    const orderedGroups = DEFAULT_EXECUTION_GROUPS.map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item })),
    }));
    return { ...entry, groups: [...remainingGroups, ...orderedGroups] };
  });

  return {
    ...site,
    subjects,
    migrations: [...migrations, EXECUTION_TOPICS_MIGRATION],
    updatedAt: new Date().toISOString(),
  };
}

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
    const site = { ...normalized, updatedAt: rawUpdatedAt };
    const migrated = migrateExecutionTopics(site);
    if (migrated !== site) {
      // ترحيل آمن لمرة واحدة: إذا تعذر الحفظ نعرض البيانات المهاجرة مؤقتًا ولا نكسر الصفحة.
      try {
        await kvSetJson(SITE_KEY, migrated);
      } catch {
        // سيعاد تطبيق الترحيل في الزيارة التالية.
      }
    }
    return migrated;
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
