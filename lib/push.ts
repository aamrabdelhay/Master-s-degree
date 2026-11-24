import { createHash, randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { del as deleteBlobs, get as getBlob, list as listBlobs, put as putBlob } from '@vercel/blob';
import { sendNotification, setVapidDetails, type PushSubscription as WebPushSubscription } from 'web-push';
import { kvDel, kvGetJson, kvSetJson } from './kv';

export const PUSH_SUBSCRIPTIONS_KEY = 'lawdiploma:push:v1';
export const MAX_PUSH_SUBSCRIPTIONS = 500;
const PUSH_BLOB_PREFIX = 'lawdiploma-push/subscriptions/';

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
export function isPushSubscriptionConfigured(): boolean {
  // The browser only needs the public VAPID key to create its own subscription.
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim());
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
  try {
    const result = await getBlob(pathname, { access: 'private', token });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const raw = await new Response(result.stream).text();
    const parsed: unknown = JSON.parse(raw);
    return isStoredSubscription(parsed) ? parsed : null;
  } catch {
    // A single unreadable record must not stop a broadcast to everyone else.
    return null;
  }
}

const BLOB_PATH_RE = /^lawdiploma-push\/subscriptions\/([a-f0-9]{64})\/(\d{13})-[0-9a-f-]+\.json$/i;

/** Cheap lookup of one device: lists only that endpoint's folder and reads its newest record. */
async function findBlobSubscription(endpoint: string): Promise<{ subscription: StoredPushSubscription | null; oldPaths: string[] }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error('Private Blob storage is not configured for push subscriptions.');
  const page = await listBlobs({ prefix: endpointBlobPrefix(endpointHash(endpoint)), limit: 100, token });
  const paths = page.blobs.map((blob) => blob.pathname).filter((pathname) => BLOB_PATH_RE.test(pathname)).sort();
  if (paths.length === 0) return { subscription: null, oldPaths: [] };
  const newest = paths[paths.length - 1];
  const subscription = await readBlobSubscription(newest);
  return { subscription, oldPaths: paths.slice(0, -1) };
}

async function countBlobEndpoints(): Promise<number> {
  const hashes = new Set<string>();
  for (const pathname of await listPushBlobPaths()) {
    const match = pathname.match(BLOB_PATH_RE);
    if (match) hashes.add(match[1]);
  }
  return hashes.size;
}

let neonPushClient: ReturnType<typeof neon> | null = null;
function getPushDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error('Neon database is not configured for push subscriptions.');
  if (!neonPushClient) neonPushClient = neon(url);
  return neonPushClient;
}
type PushRow = {
  endpoint_hash: string; endpoint: string; p256dh: string; auth: string;
  subject_ids: string[] | null; created_at: string; updated_at: string;
};
function mapPushRow(row: PushRow): StoredPushSubscription {
  return {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
    subjectIds: row.subject_ids,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
export async function findPushSubscription(endpoint: string): Promise<StoredPushSubscription | null> {
  const sql = getPushDb();
  const rows = await sql`SELECT endpoint_hash, endpoint, p256dh, auth, subject_ids, created_at, updated_at
    FROM public.lawdiploma_push_subscriptions WHERE endpoint_hash = ${endpointHash(endpoint)} LIMIT 1` as unknown as PushRow[];
  return rows[0] ? mapPushRow(rows[0]) : null;
}
export async function listPushSubscriptions(): Promise<StoredPushSubscription[]> {
  const sql = getPushDb();
  const rows = await sql`SELECT endpoint_hash, endpoint, p256dh, auth, subject_ids, created_at, updated_at
    FROM public.lawdiploma_push_subscriptions ORDER BY updated_at DESC LIMIT ${MAX_PUSH_SUBSCRIPTIONS}` as unknown as PushRow[];
  return rows.map(mapPushRow);
}
export async function upsertPushSubscription(subscription: StoredPushSubscription): Promise<{ saved: boolean; count: number }> {
  const sql = getPushDb();
  const hash = endpointHash(subscription.endpoint);
  await sql`INSERT INTO public.lawdiploma_push_subscriptions
    (endpoint_hash, endpoint, p256dh, auth, subject_ids, created_at, updated_at)
    VALUES (${hash}, ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth},
      ${subscription.subjectIds ? JSON.stringify(subscription.subjectIds) : null}::jsonb,
      ${subscription.createdAt}, now())
    ON CONFLICT (endpoint_hash) DO UPDATE SET
      endpoint = EXCLUDED.endpoint, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
      subject_ids = EXCLUDED.subject_ids, updated_at = now()`;
  const rows = await sql`SELECT count(*)::int AS count FROM public.lawdiploma_push_subscriptions` as unknown as Array<{count:number}>;
  return { saved: true, count: Number(rows[0]?.count ?? 0) };
}
export async function removePushSubscriptions(endpoints: string[]): Promise<number> {
  if (endpoints.length === 0) return 0;
  const sql = getPushDb();
  let removed = 0;
  for (const endpoint of endpoints) {
    const rows = await sql`DELETE FROM public.lawdiploma_push_subscriptions
      WHERE endpoint_hash = ${endpointHash(endpoint)} RETURNING endpoint_hash`;
    removed += rows.length;
  }
  return removed;
}
export async function removePushSubscription(endpoint: string): Promise<boolean> {
  return (await removePushSubscriptions([endpoint])) > 0;
}
export async function deliverPush(subscription: StoredPushSubscription, payload: PushPayload, ttlSeconds: number): Promise<void> {
  const webSubscription: WebPushSubscription = { endpoint: subscription.endpoint, keys: subscription.keys };
  await sendNotification(webSubscription, JSON.stringify(payload), {
    TTL: Math.max(60, Math.min(86_400, Math.floor(ttlSeconds))),
    urgency: 'normal', topic: payload.tag.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32),
  });
}
