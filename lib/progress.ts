import type { PublicSubject } from './types';

export type TextTopicKind = 'curriculum' | 'progress';
export type StudentProgress = Record<string, string[]>;
export const PROGRESS_STORAGE_KEY = 'lawdiploma:student-progress:v1';

export type ProgressTopic = { key: string; text: string };

function stripLeadingNumber(value: string): string {
  return value.replace(/^(?:[-*•▪◦‣]+)\s*/, '')
    .replace(/^(?:\d+|[٠-٩۰-۹]+)\s*[.)、:-]\s*/u, '').trim();
}

export function numberedPoints(value: string): string[] {
  return value.split(/\r?\n/).map(stripLeadingNumber).filter(Boolean);
}

export function normalizeTopicText(value: string): string {
  return stripLeadingNumber(value).normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase();
}

/** FNV-1a 32-bit hash ثابت لا يعتمد على بيئة المتصفح. */
export function stableTextHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function textTopicKey(kind: TextTopicKind, value: string): string {
  return kind + ':' + stableTextHash(normalizeTopicText(value));
}

export function groupTopicKey(itemId: string): string {
  return 'question:' + itemId;
}

export function getSubjectTopics(subject: PublicSubject): ProgressTopic[] {
  const curriculum = numberedPoints(subject.curriculum).map((text) => ({
    key: textTopicKey('curriculum', text), text,
  }));
  const progress = numberedPoints(subject.progress).map((text) => ({
    key: textTopicKey('progress', text), text,
  }));
  const questions = subject.groups.flatMap((group) =>
    group.items.filter((item) => item.text.trim().length > 0)
      .map((item) => ({ key: groupTopicKey(item.id), text: item.text })),
  );
  return [...curriculum, ...progress, ...questions];
}

export function collectValidProgressKeys(subjects: PublicSubject[]): Record<string, Set<string>> {
  return Object.fromEntries(subjects.map((subject) => [
    subject.id, new Set(getSubjectTopics(subject).map((topic) => topic.key)),
  ]));
}

/** تنظيف التقدم وحذف المواد/الموضوعات المحذوفة من نسخة الأدمن الحالية. */
export function sanitizeProgress(value: unknown, subjects: PublicSubject[]): StudentProgress {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const root = value as Record<string, unknown>;
  const rawCompleted =
    typeof root.completed === 'object' && root.completed !== null && !Array.isArray(root.completed)
      ? root.completed as Record<string, unknown> : root;
  const validKeys = collectValidProgressKeys(subjects);
  const result: StudentProgress = {};
  for (const [subjectId, keys] of Object.entries(validKeys)) {
    const raw = rawCompleted[subjectId];
    if (!Array.isArray(raw)) continue;
    const accepted = raw.filter((key): key is string =>
      typeof key === 'string' && keys.has(key));
    if (accepted.length > 0) result[subjectId] = [...new Set(accepted)];
  }
  return result;
}

export function countSubjectProgress(subject: PublicSubject, progress: StudentProgress) {
  const topics = getSubjectTopics(subject);
  const completedKeys = new Set(progress[subject.id] || []);
  const completed = topics.filter((topic) => completedKeys.has(topic.key)).length;
  const total = topics.length;
  return {
    completed, total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    remaining: Math.max(0, total - completed),
  };
}

export function isTopicCompleted(progress: StudentProgress, subjectId: string, topicKey: string): boolean {
  return (progress[subjectId] || []).includes(topicKey);
}
