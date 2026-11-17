import { isKvConfigured, kvGetJson, kvGetRaw, kvIncr, kvSetJson } from './kv';

const TOTAL_VISITS_KEY = 'lawdiploma:analytics:visits:total';
const ACTIVE_VISITORS_KEY = 'lawdiploma:analytics:visitors:active';
const HOURLY_PREFIX = 'lawdiploma:analytics:visits:hour:';
const STUDY_SCORES_KEY = 'lawdiploma:analytics:study-scores:v1';
const LONG_TTL = 100 * 365 * 24 * 60 * 60;
type ActiveVisitorMap = Record<string, number>;
type StudyScoreRecord = { deviceId: string; score: number; updatedAt: number };

export function analyticsReady(): boolean { return isKvConfigured(); }
export async function recordSiteVisit(now = Date.now()): Promise<void> {
  await kvIncr(TOTAL_VISITS_KEY, LONG_TTL);
  await kvIncr(HOURLY_PREFIX + Math.floor(now / 3_600_000), 48 * 60 * 60);
}
export async function touchActiveVisitor(deviceId: string, now = Date.now()): Promise<number> {
  const stored = await kvGetJson<ActiveVisitorMap>(ACTIVE_VISITORS_KEY);
  const active: ActiveVisitorMap = {};
  if (stored && typeof stored === 'object') {
    for (const [id, timestamp] of Object.entries(stored)) {
      if (typeof timestamp === 'number' && timestamp >= now - 120_000) active[id] = timestamp;
    }
  }
  active[deviceId] = now;
  await kvSetJson(ACTIVE_VISITORS_KEY, active, 180);
  return Object.keys(active).length;
}
export async function getAnalyticsSnapshot() {
  const now = Date.now();
  const currentHour = Math.floor(now / 3_600_000);
  const buckets = await Promise.all(Array.from({ length: 24 }, async (_, index) => {
    const hour = currentHour - (23 - index);
    const raw = await kvGetRaw(HOURLY_PREFIX + hour);
    const visits = raw === null ? 0 : Math.max(0, Number.parseInt(raw, 10) || 0);
    const label = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' })
      .format(new Date(hour * 3_600_000));
    return { hour, label, visits };
  }));
  const totalRaw = await kvGetRaw(TOTAL_VISITS_KEY);
  const active = await kvGetJson<ActiveVisitorMap>(ACTIVE_VISITORS_KEY);
  const cutoff = now - 120_000;
  const activeNow = active && typeof active === 'object'
    ? Object.values(active).filter((timestamp) => typeof timestamp === 'number' && timestamp >= cutoff).length : 0;
  return {
    activeNow,
    totalVisits: totalRaw === null ? 0 : Math.max(0, Number.parseInt(totalRaw, 10) || 0),
    last24Hours: buckets.reduce((sum, bucket) => sum + bucket.visits, 0),
    buckets,
    updatedAt: new Date(now).toISOString(),
  };
}
export async function saveAnonymousStudyScore(deviceId: string, score: number) {
  const stored = await kvGetJson<StudyScoreRecord[]>(STUDY_SCORES_KEY);
  const records = Array.isArray(stored) ? stored.filter((item) => item &&
    typeof item.deviceId === 'string' && typeof item.score === 'number' && Number.isFinite(item.score)) : [];
  const existingIndex = records.findIndex((item) => item.deviceId === deviceId);
  const record: StudyScoreRecord = { deviceId, score: Math.max(0, Math.min(100, Math.round(score))), updatedAt: Date.now() };
  if (existingIndex >= 0) records[existingIndex] = record;
  else records.push(record);
  records.sort((a, b) => b.updatedAt - a.updatedAt);
  if (records.length > 20_000) records.length = 20_000;
  await kvSetJson(STUDY_SCORES_KEY, records);
  const others = records.filter((item) => item.deviceId !== deviceId);
  const betterThan = others.filter((item) => item.score < record.score).length;
  return { percentile: others.length === 0 ? null : Math.round((betterThan / others.length) * 100), sampleSize: others.length };
}
