import { createHash } from 'node:crypto';
import { sendNotification, setVapidDetails, type PushSubscription as WebPushSubscription } from 'web-push';
import { kvDel, kvGetJson, kvIncr, kvSetJson } from './kv';

export const PUSH_SUBSCRIPTIONS_KEY = 'lawdiploma:push:v1';
export const MAX_PUSH_SUBSCRIPTIONS = 500;
const SENT_MARKER_PREFIX = 'lawdiploma:push:sent:';
const SENT_MARKER_TTL_SECONDS = 45 * 24 * 60 * 60;

export type StoredPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  subjectIds: string[] | null;
  createdAt: string;
  updatedAt: string;
};
type PushPayload = { title: string; body: string; url: string; tag: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isStoredSubscription(value: unknown): value is StoredPushSubscription {
  if (!isRecord(value) || !isRecord(value.keys)) return false;
  return typeof value.endpoint === 'string' && typeof value.keys.p256dh === 'string' &&
    typeof value.keys.auth === 'string' &&
    (value.subjectIds === null || (Array.isArray(value.subjectIds) &&
      value.subjectIds.every((id) => typeof id === 'string'))) &&
    typeof value.createdAt === 'string' && typeof value.updatedAt === 'string';
}
export function isSafePushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password && !url.hash;
  } catch { return false; }
}
export function isPushDeliveryConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
    process.env.VAPID_PRIVATE_KEY?.trim() && process.env.VAPID_SUBJECT?.trim());
}
export function configurePushDelivery(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return false;
  try { setVapidDetails(subject, publicKey, privateKey); return true; } catch { return false; }
}
export async function listPushSubscriptions(): Promise<StoredPushSubscription[]> {
  const stored = await kvGetJson<unknown>(PUSH_SUBSCRIPTIONS_KEY);
  return Array.isArray(stored) ? stored.filter(isStoredSubscription).slice(0, MAX_PUSH_SUBSCRIPTIONS) : [];
}
export async function upsertPushSubscription(subscription: StoredPushSubscription): Promise<{ saved: boolean; count: number }> {
  const subscriptions = await listPushSubscriptions();
  const index = subscriptions.findIndex((item) => item.endpoint === subscription.endpoint);
  if (index >= 0) {
    subscriptions[index] = { ...subscriptions[index], ...subscription,
      createdAt: subscriptions[index].createdAt, updatedAt: new Date().toISOString() };
  } else {
    if (subscriptions.length >= MAX_PUSH_SUBSCRIPTIONS) return { saved: false, count: subscriptions.length };
    subscriptions.push(subscription);
  }
  await kvSetJson(PUSH_SUBSCRIPTIONS_KEY, subscriptions);
  return { saved: true, count: subscriptions.length };
}
export async function removePushSubscriptions(endpoints: string[]): Promise<number> {
  if (endpoints.length === 0) return 0;
  const removed = new Set(endpoints);
  const subscriptions = await listPushSubscriptions();
  const next = subscriptions.filter((subscription) => !removed.has(subscription.endpoint));
  if (next.length !== subscriptions.length) await kvSetJson(PUSH_SUBSCRIPTIONS_KEY, next);
  return subscriptions.length - next.length;
}
export async function removePushSubscription(endpoint: string): Promise<boolean> {
  return (await removePushSubscriptions([endpoint])) > 0;
}
export function reminderLedgerKey(endpoint: string, subjectId: string, examAtIso: string, kind: '24h' | '1h'): string {
  return [endpoint, subjectId, examAtIso, kind].join('|');
}
export async function claimPushReminder(key: string): Promise<boolean> {
  const hash = createHash('sha256').update(key).digest('hex');
  return (await kvIncr(SENT_MARKER_PREFIX + hash, SENT_MARKER_TTL_SECONDS)) === 1;
}
export async function releasePushReminderClaim(key: string): Promise<void> {
  const hash = createHash('sha256').update(key).digest('hex');
  await kvDel(SENT_MARKER_PREFIX + hash);
}
export async function deliverPush(subscription: StoredPushSubscription, payload: PushPayload, ttlSeconds: number): Promise<void> {
  const webSubscription: WebPushSubscription = { endpoint: subscription.endpoint, keys: subscription.keys };
  await sendNotification(webSubscription, JSON.stringify(payload), {
    TTL: Math.max(60, Math.min(86_400, Math.floor(ttlSeconds))),
    urgency: 'high', topic: payload.tag.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32),
  });
}
