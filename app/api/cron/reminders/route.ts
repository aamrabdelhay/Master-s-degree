import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cairoWallToUtcIso, formatCairoLabel } from '@/lib/cairo';
import { isKvConfigured } from '@/lib/kv';
import { getSite } from '@/lib/store';
import {
  claimPushReminder, configurePushDelivery, deliverPush, isPushDeliveryConfigured,
  listPushSubscriptions, reminderLedgerKey, releasePushReminderClaim,
  removePushSubscriptions, type StoredPushSubscription,
} from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const MINUTE_MS = 60_000;
const REMINDER_WINDOW_MS = 10 * MINUTE_MS;
type ReminderJob = {
  subscription: StoredPushSubscription; endpoint: string; key: string;
  title: string; body: string; url: string; tag: string; ttl: number;
};
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const received = request.headers.get('authorization') || '';
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from('Bearer ' + secret);
  const actual = Buffer.from(received);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function statusCodeFromError(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const status = (error as Record<string, unknown>).statusCode;
  return typeof status === 'number' ? status : null;
}
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'غير مسموح.' }, { status: 401 });
  if (!isKvConfigured()) return NextResponse.json({ error: 'التخزين الدائم مش متوصل.' }, { status: 503 });
  if (!isPushDeliveryConfigured() || !configurePushDelivery()) {
    return NextResponse.json({ error: 'إعدادات VAPID ناقصة أو غير صالحة.' }, { status: 503 });
  }
  try {
    const now = Date.now();
    const site = await getSite();
    const subscriptions = await listPushSubscriptions();
    const jobs: ReminderJob[] = [];
    for (const subject of site.subjects) {
      const examAtIso = cairoWallToUtcIso(subject.examAt);
      const examAtMs = examAtIso ? new Date(examAtIso).getTime() : Number.NaN;
      if (!examAtIso || !Number.isFinite(examAtMs)) continue;
      const delta = examAtMs - now;
      const dateLabel = formatCairoLabel(subject.examAt) || subject.examAt || '';
      const reminders = [
        { kind: '24h' as const, offset: 24 * 60 * MINUTE_MS, body: 'متبقي ٢٤ ساعة على موعد الامتحان. الموعد: ' + dateLabel },
        { kind: '1h' as const, offset: 60 * MINUTE_MS, body: 'متبقي ساعة واحدة على موعد الامتحان. الموعد: ' + dateLabel },
      ];
      for (const reminder of reminders) {
        if (Math.abs(delta - reminder.offset) > REMINDER_WINDOW_MS) continue;
        for (const subscription of subscriptions) {
          if (subscription.subjectIds !== null && !subscription.subjectIds.includes(subject.id)) continue;
          jobs.push({
            subscription, endpoint: subscription.endpoint,
            key: reminderLedgerKey(subscription.endpoint, subject.id, examAtIso, reminder.kind),
            title: 'موعد امتحان ' + subject.name, body: reminder.body,
            url: '/#' + encodeURIComponent(subject.id),
            tag: 'exam-' + subject.id + '-' + reminder.kind,
            ttl: Math.max(60, Math.floor(delta / 1000)),
          });
        }
      }
    }
    let sent = 0;
    let failed = 0;
    let skippedAsDuplicate = 0;
    const invalidEndpoints = new Set<string>();
    for (let index = 0; index < jobs.length; index += 25) {
      const batch = jobs.slice(index, index + 25);
      const results = await Promise.all(batch.map(async (job) => {
        try {
          if (!(await claimPushReminder(job.key))) return { status: 'duplicate' as const, endpoint: job.endpoint };
          try {
            await deliverPush(job.subscription, {
              title: job.title, body: job.body, url: job.url, tag: job.tag,
            }, job.ttl);
            return { status: 'sent' as const, endpoint: job.endpoint };
          } catch (error) {
            const statusCode = statusCodeFromError(error);
            if (statusCode !== 404 && statusCode !== 410) await releasePushReminderClaim(job.key).catch(() => undefined);
            return { status: 'failed' as const, endpoint: job.endpoint, remove: statusCode === 404 || statusCode === 410 };
          }
        } catch { return { status: 'failed' as const, endpoint: job.endpoint, remove: false }; }
      }));
      for (const result of results) {
        if (result.status === 'sent') sent += 1;
        else if (result.status === 'duplicate') skippedAsDuplicate += 1;
        else {
          failed += 1;
          if (result.remove) invalidEndpoints.add(result.endpoint);
        }
      }
    }
    const removed = await removePushSubscriptions([...invalidEndpoints]);
    return NextResponse.json({
      ok: true, checkedSubscriptions: subscriptions.length, dueDeliveries: jobs.length,
      sent, failed, skippedAsDuplicate, removedExpiredSubscriptions: removed,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return NextResponse.json({ error: 'حصل خطأ أثناء تجهيز أو إرسال تنبيهات الامتحان.' }, { status: 500 });
  }
}
