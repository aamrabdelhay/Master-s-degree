import { createHash, randomUUID } from 'node:crypto';
import { del as deleteBlobs, get as getBlob, list as listBlobs, put as putBlob } from '@vercel/blob';
import { sendNotification, setVapidDetails, type PushSubscription as WebPushSubscription } from 'web-push';
import { kvDel, kvGetJson, kvIncr, kvSetJson } from './kv';

export const PUSH_SUBSCRIPTIONS_KEY = 'lawdiploma:push:v1';
export const MAX_PUSH_SUBSCRIPTIONS = 500;
const PUSH_BLOB_PREFIX = 'lawdiploma-push/subscriptions/';
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
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const approvedHost =
      host === 'fcm.googleapis.com' ||
      host === 'web.push.apple.com' ||
      host.endsWith('.push.apple.com') ||
      host === 'push.services.mozilla.com' ||
      host.endsWith('.push.services.mozilla.com') ||
      host === 'notify.windows.com' ||
      host.endsWith('.notify.windows.com');

    return url.protocol === 'https:' && url.port === '' &&
      approvedHost && !url.username && !url.password && !url.hash;
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

function hasPerEndpointBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}
function endpointHash(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}
function endpointBlobPrefix(hash: string): string {
  return PUSH_BLOB_PREFIX + hash + '/';
}
async function writeBlobSubscription(subscription: StoredPushSubscription): Promise<void> {
  const timestamp = Date.parse(subscription.updatedAt);
  const version = String(Number.isFinite(timestamp) ? timestamp : Date.now()).padStart(13, '0');
  const pathname = endpointBlobPrefix(endpointHash(subscription.endpoint)) + version + '-' + randomUUID() + '.json';
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error('Private Blob storage is not configured for push subscriptions.');
  await putBlob(pathname, JSON.stringify(subscription), {
    access: 'private',
    contentType: 'application/json',
    cacheControlMaxAge: 60,
    token,
  });
}
async function listPushBlobPaths(): Promise<string[]> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error('Private Blob storage is not configured for push subscriptions.');
  const paths: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await listBlobs({
      prefix: PUSH_BLOB_PREFIX,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
      token,
    });
    paths.push(...page.blobs.map((blob) => blob.pathname));
    cursor = page.cursor || undefined;
  } while (cursor);
  return paths;
}
async function readBlobSubscription(pathname: string): Promise<StoredPushSubscription | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error('Private Blob storage is not configured for push subscriptions.');
  const result = await getBlob(pathname, { access: 'private', token });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const raw = await new Response(result.stream).text();
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredSubscription(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Migrate the previous shared array once; all new records are stored by endpoint. */
async function migrateLegacyPushSubscriptions(): Promise<void> {
  const legacy = await kvGetJson<unknown>(PUSH_SUBSCRIPTIONS_KEY);
  if (!Array.isArray(legacy)) return;
  const valid = legacy.filter(isStoredSubscription).slice(0, MAX_PUSH_SUBSCRIPTIONS);
  for (const subscription of valid) await writeBlobSubscription(subscription);
  await kvDel(PUSH_SUBSCRIPTIONS_KEY);
}

async function listBlobPushSubscriptions(): Promise<StoredPushSubscription[]> {
  await migrateLegacyPushSubscriptions();
  const paths = await listPushBlobPaths();
  const latestByEndpoint = new Map<string, { pathname: string; version: string }>();
  const recognized = new Set<string>();

  for (const pathname of paths) {
    const match = pathname.match(/^lawdiploma-push\/subscriptions\/([a-f0-9]{64})\/(\d{13})-[0-9a-f-]+\.json$/i);
    if (!match) continue;
    recognized.add(pathname);
    const current = latestByEndpoint.get(match[1]);
    if (!current || match[2] > current.version) {
      latestByEndpoint.set(match[1], { pathname, version: match[2] });
    }
  }

  const selected = [...latestByEndpoint.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_PUSH_SUBSCRIPTIONS);
  const latestPaths = new Set([...latestByEndpoint.values()].map((item) => item.pathname));
  const stalePaths = [...recognized].filter((pathname) => !latestPaths.has(pathname));
  if (stalePaths.length > 0) {
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (!token) throw new Error('Private Blob storage is not configured for push subscriptions.');
    await deleteBlobs(stalePaths, { token });
  }

  const subscriptions: StoredPushSubscription[] = [];
  for (let index = 0; index < selected.length; index += 25) {
    const batch = selected.slice(index, index + 25);
    const results = await Promise.all(batch.map(([, item]) => readBlobSubscription(item.pathname)));
    for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
      const subscription = results[resultIndex];
      const expectedHash = batch[resultIndex][0];
      if (subscription && endpointHash(subscription.endpoint) === expectedHash) subscriptions.push(subscription);
    }
  }
  return subscriptions;
}

async function listLegacyPushSubscriptions(): Promise<StoredPushSubscription[]> {
  const stored = await kvGetJson<unknown>(PUSH_SUBSCRIPTIONS_KEY);
  return Array.isArray(stored) ? stored.filter(isStoredSubscription).slice(0, MAX_PUSH_SUBSCRIPTIONS) : [];
}

export async function listPushSubscriptions(): Promise<StoredPushSubscription[]> {
  return hasPerEndpointBlobStorage()
    ? listBlobPushSubscriptions()
    : listLegacyPushSubscriptions();
}

export async function upsertPushSubscription(subscription: StoredPushSubscription): Promise<{ saved: boolean; count: number }> {
  const subscriptions = await listPushSubscriptions();
  const existing = subscriptions.find((item) => item.endpoint === subscription.endpoint);

  if (!existing && subscriptions.length >= MAX_PUSH_SUBSCRIPTIONS) {
    return { saved: false, count: subscriptions.length };
  }

  const stored: StoredPushSubscription = {
    ...subscription,
    createdAt: existing?.createdAt || subscription.createdAt,
    updatedAt: new Date().toISOString(),
  };

  if (hasPerEndpointBlobStorage()) {
    // One immutable private Blob per endpoint version prevents concurrent devices
    // from overwriting one another through a shared read-modify-write array.
    await writeBlobSubscription(stored);
    return { saved: true, count: subscriptions.length + (existing ? 0 : 1) };
  }

  const legacy = await listLegacyPushSubscriptions();
  const index = legacy.findIndex((item) => item.endpoint === subscription.endpoint);
  if (index >= 0) {
    legacy[index] = stored;
  } else {
    if (legacy.length >= MAX_PUSH_SUBSCRIPTIONS) return { saved: false, count: legacy.length };
    legacy.push(stored);
  }
  await kvSetJson(PUSH_SUBSCRIPTIONS_KEY, legacy);
  return { saved: true, count: legacy.length };
}

export async function removePushSubscriptions(endpoints: string[]): Promise<number> {
  if (endpoints.length === 0) return 0;

  if (hasPerEndpointBlobStorage()) {
    await migrateLegacyPushSubscriptions();
    const hashes = new Set(endpoints.map(endpointHash));
    const paths = await listPushBlobPaths();
    const matching = paths.filter((pathname) => {
      const match = pathname.match(/^lawdiploma-push\/subscriptions\/([a-f0-9]{64})\//i);
      return Boolean(match && hashes.has(match[1]));
    });
    if (matching.length > 0) {
      const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
      if (!token) throw new Error('Private Blob storage is not configured for push subscriptions.');
      await deleteBlobs(matching, { token });
    }
    return new Set(matching.map((pathname) =>
      pathname.match(/^lawdiploma-push\/subscriptions\/([a-f0-9]{64})\//i)?.[1],
    ).filter(Boolean)).size;
  }

  const removed = new Set(endpoints);
  const subscriptions = await listLegacyPushSubscriptions();
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
    urgency: 'normal', topic: payload.tag.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32),
  });
}
