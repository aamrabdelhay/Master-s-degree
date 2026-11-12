import type {
  QuestionGroup,
  QuestionItem,
  PublicSubject,
  SiteData,
  Subject,
} from './types';
import { cairoWallToUtcIso, formatCairoLabel, isValidCairoWallTime } from './cairo';
import { DEFAULT_BOOK_URL, createDefaultSite } from './defaults';

const MAX_TEXT = 2000;
const MAX_LONG_TEXT = 8000;
const MAX_NAME = 200;
const MAX_URL = 500;
const MAX_GROUPS = 30;
const MAX_ITEMS = 80;

function str(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  // نشيل أي وسوم HTML عشان مايحصلش حقن في الصفحة العامة
  const cleaned = value.replace(/<\/?[a-z][^>]*>/gi, '');
  return cleaned.slice(0, max);
}

function id(value: unknown, prefix: string): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw && /^[a-zA-Z0-9-_]{1,64}$/.test(raw)) return raw;
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeUrl(value: unknown): string {
  const raw = str(value, MAX_URL).trim();
  if (!raw) return '';
  if (/^https?:\/\/[^\s<>"']+$/i.test(raw)) return raw;
  return '';
}

function normalizeItem(input: unknown, index: number): QuestionItem {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    id: id(raw.id, `q${index}`),
    text: str(raw.text, MAX_TEXT).trim(),
  };
}

function normalizeGroup(input: unknown, index: number): QuestionGroup {
  const raw = (input ?? {}) as Record<string, unknown>;
  const itemsInput = Array.isArray(raw.items) ? raw.items : [];
  return {
    id: id(raw.id, `g${index}`),
    title: str(raw.title, MAX_NAME).trim(),
    items: itemsInput.slice(0, MAX_ITEMS).map(normalizeItem),
  };
}

function normalizeSubject(input: unknown, index: number): Subject {
  const raw = (input ?? {}) as Record<string, unknown>;
  const groupsInput = Array.isArray(raw.groups) ? raw.groups : [];
  const examAtRaw = typeof raw.examAt === 'string' ? raw.examAt.trim() : '';
  const bookUrl = safeUrl(raw.bookUrl);

  return {
    id: id(raw.id, `sub${index}`),
    name: str(raw.name, MAX_NAME).trim(),
    examAt: isValidCairoWallTime(examAtRaw) ? examAtRaw : null,
    examFormat: str(raw.examFormat, MAX_LONG_TEXT).trim(),
    curriculum: str(raw.curriculum, MAX_LONG_TEXT).trim(),
    progress: str(raw.progress, MAX_LONG_TEXT).trim(),
    cancelled: str(raw.cancelled, MAX_LONG_TEXT).trim(),
    bookUrl: bookUrl || DEFAULT_BOOK_URL,
    groups: groupsInput
      .slice(0, MAX_GROUPS)
      .map(normalizeGroup)
      .filter((group) => group.items.length > 0 || group.title.length > 0),
  };
}

/** تنظيف كامل للبيانات الجاية من الأدمن قبل الحفظ */
export function normalizeSite(input: unknown): SiteData {
  const raw = (input ?? {}) as Record<string, unknown>;
  const subjectsInput = Array.isArray(raw.subjects) ? raw.subjects : [];
  const subjects = subjectsInput.map(normalizeSubject);

  // نضمن إن مفيش IDs مكررة
  const seen = new Set<string>();
  for (const subject of subjects) {
    let current = subject.id;
    let counter = 1;
    while (seen.has(current)) {
      current = `${subject.id}-${counter++}`;
    }
    subject.id = current;
    seen.add(current);
  }

  return {
    headerTitle: str(raw.headerTitle, MAX_NAME).trim() || createDefaultSite().headerTitle,
    headerSubtitle: str(raw.headerSubtitle, MAX_NAME).trim() || createDefaultSite().headerSubtitle,
    subjects,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * ترتيب العرض:
 *  1) المواد اللي ليها موعد، الأقرب الأول.
 *  2) المواد اللي لسه ملهاش موعد، في الآخر بترتيبها اليدوي.
 */
export function sortSubjectsForDisplay(subjects: Subject[]): Subject[] {
  const withDate: { subject: Subject; time: number }[] = [];
  const withoutDate: Subject[] = [];

  for (const subject of subjects) {
    const iso = cairoWallToUtcIso(subject.examAt);
    if (iso) withDate.push({ subject, time: new Date(iso).getTime() });
    else withoutDate.push(subject);
  }

  withDate.sort((a, b) => a.time - b.time);
  return [...withDate.map((entry) => entry.subject), ...withoutDate];
}

/** تجهيز المواد للعرض في الصفحة العامة (مع التوقيت المحسوب) */
export function toPublicSubjects(subjects: Subject[]): PublicSubject[] {
  return sortSubjectsForDisplay(subjects).map((subject) => ({
    ...subject,
    examAtIso: cairoWallToUtcIso(subject.examAt),
    examAtLabel: formatCairoLabel(subject.examAt),
  }));
}
