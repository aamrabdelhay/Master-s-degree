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

const EXECUTION_GROUPS_MERGED_MIGRATION = 'execution-topics-groups-merged-v2';

/** دمج العناصر القديمة في قائمة واحدة وإزالة عنوان "خصومة التنفيذ الوقتية" مرة واحدة. */
function mergeExecutionTopicGroups(site: SiteData): SiteData {
  const migrations = site.migrations ?? [];
  if (migrations.includes(EXECUTION_GROUPS_MERGED_MIGRATION)) return site;

  const subject = site.subjects.find(
    (entry) => entry.name.includes('مرافعات') || entry.name.includes('التنفيذ الجبري'),
  );
  if (!subject) return site;

  const subjects = site.subjects.map((entry) => {
    if (entry.id !== subject.id) return entry;

    const legacyIndex = entry.groups.findIndex(
      (group) =>
        group.id === 'execution-timely-disputes' ||
        group.title.trim() === 'خصومة التنفيذ الوقتية',
    );
    if (legacyIndex < 0) return entry;

    const primaryIndex = entry.groups.findIndex(
      (group) =>
        group.id === 'execution-covered-topics' ||
        group.title.trim() === 'الموضوعات التي تم شرحها',
    );
    const destinationIndex = primaryIndex >= 0 ? primaryIndex : 0;
    if (destinationIndex === legacyIndex) return entry;

    const legacyGroup = entry.groups[legacyIndex];
    const destinationGroup = entry.groups[destinationIndex];
    if (!destinationGroup || destinationGroup.id === legacyGroup.id) return entry;

    const groups = entry.groups
      .filter((group) => group.id !== legacyGroup.id)
      .map((group) =>
        group.id === destinationGroup.id
          ? { ...group, items: [...group.items, ...legacyGroup.items] }
          : group,
      );
    return { ...entry, groups };
  });

  return {
    ...site,
    subjects,
    migrations: [...migrations, EXECUTION_GROUPS_MERGED_MIGRATION],
    updatedAt: new Date().toISOString(),
  };
}

const EXECUTION_SIX_TOPICS_MIGRATION = 'execution-six-topics-replacement-v1';

/** استبدال قائمة موضوعات التنفيذ القديمة بالموضوعات الستة المعتمدة مرة واحدة. */
function replaceExecutionTopicsWithSix(site: SiteData): SiteData {
  const migrations = site.migrations ?? [];
  if (migrations.includes(EXECUTION_SIX_TOPICS_MIGRATION)) return site;

  const subject = site.subjects.find(
    (entry) => entry.name.includes('مرافعات') || entry.name.includes('التنفيذ الجبري'),
  );
  if (!subject) return site;

  const subjects = site.subjects.map((entry) =>
    entry.id === subject.id
      ? {
          ...entry,
          groups: DEFAULT_EXECUTION_GROUPS.map((group) => ({
            ...group,
            items: group.items.map((item) => ({ ...item })),
          })),
        }
      : entry,
  );

  return {
    ...site,
    subjects,
    migrations: [...migrations, EXECUTION_SIX_TOPICS_MIGRATION],
    updatedAt: new Date().toISOString(),
  };
}

const CONSUMER_PROTECTION_TOPICS_MIGRATION = 'consumer-protection-license-transfer-topics-v1';

const CONSUMER_PROTECTION_TOPICS = [
  'تعريف التكنولوجيا',
  'تعريف عقد الترخيص',
  'مصادر نقل التكنولوجيا',
  'الشروط المقيدة للمستورد في عقد الترخيص',
  'التزامات أطراف عقد الترخيص',
  '(التزامات المورد)',
  'الجزاءات الناشئة عن إخلال المرخص لالتزاماته العقدية',
  'فض المنازعات الناشئة عن عقد الترخيص',
];

/** إضافة موضوعات نقل التكنولوجيا إلى متابعة مقرر حماية المستهلك مرة واحدة دون حذف التقدم الحالي. */
function migrateConsumerProtectionTopics(site: SiteData): SiteData {
  const migrations = site.migrations ?? [];
  if (migrations.includes(CONSUMER_PROTECTION_TOPICS_MIGRATION)) return site;

  const subject = site.subjects.find((entry) => entry.name.includes('حماية المستهلك'));
  if (!subject) return site;

  const existingTopics = new Set(
    subject.progress
      .split(/\r?\n/)
      .map((value) => value.replace(/^\s*(?:(?:\d+|[٠-٩۰-۹]+)\s*[.)،:-]\s*|[-*•▪◦‣]+\s*)/u, ''))
      .map(topicKey)
      .filter(Boolean),
  );
  const missingTopics = CONSUMER_PROTECTION_TOPICS.filter(
    (topic) => !existingTopics.has(topicKey(topic)),
  );

  const subjects = missingTopics.length
    ? site.subjects.map((entry) =>
        entry.id === subject.id
          ? {
              ...entry,
              progress: [entry.progress.trim(), ...missingTopics].filter(Boolean).join('\n'),
            }
          : entry,
      )
    : site.subjects;

  return {
    ...site,
    subjects,
    migrations: [...migrations, CONSUMER_PROTECTION_TOPICS_MIGRATION],
    updatedAt: new Date().toISOString(),
  };
}


const EXAM_SCHEDULE_MIGRATION = 'exam-schedule-dec-2026-jan-2027-v1';

/** إضافة مواعيد الامتحانات المعتمدة مرة واحدة مع الحفاظ على أي بيانات أخرى. */
function migrateExamSchedule(site: SiteData): SiteData {
  if ((site.migrations ?? []).includes(EXAM_SCHEDULE_MIGRATION)) return site;

  const schedule: Array<{ match: (name: string) => boolean; examAt: string }> = [
    { match: (name) => name.includes('مرافعات') || name.includes('التنفيذ الجبري'), examAt: '2026-12-16T12:00' },
    { match: (name) => name.includes('شريعة') || name.includes('الشريعة'), examAt: '2026-12-23T12:00' },
    { match: (name) => name.includes('حماية المستهلك'), examAt: '2026-12-23T12:00' },
    { match: (name) => name.includes('المدني المقارن') || name.includes('القانون المدني المقارن'), examAt: '2026-12-23T12:00' },
    { match: (name) => name.includes('الدولي الخاص'), examAt: '2026-12-30T12:00' },
    { match: (name) => name.includes('المدني مع التعمق') || name.includes('القانون المدني مع التعمق'), examAt: '2027-01-13T12:00' },
    { match: (name) => name.includes('قاعة البحث') || name.includes('قاعه البحث') || name.includes('مناهج البحث'), examAt: '2027-01-16T12:00' },
  ];

  const subjects = site.subjects.map((subject) => {
    const entry = schedule.find(({ match }) => match(subject.name));
    return entry ? { ...subject, examAt: entry.examAt } : subject;
  });

  return {
    ...site,
    subjects,
    migrations: [...(site.migrations ?? []), EXAM_SCHEDULE_MIGRATION],
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
    const executionMigrated = migrateExecutionTopics(site);
    const groupsMerged = mergeExecutionTopicGroups(executionMigrated);
    const consumerMigrated = migrateConsumerProtectionTopics(groupsMerged);
    const migrated = replaceExecutionTopicsWithSix(consumerMigrated);
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
