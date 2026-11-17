import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/store';
import { isAuthenticated } from '@/lib/auth';
import { isKvConfigured } from '@/lib/kv';
import {
  configurePushDelivery, deliverPush, isPushDeliveryConfigured,
  listPushSubscriptions, removePushSubscriptions,
} from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function statusCodeFromError(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const status = (error as Record<string, unknown>).statusCode;
  return typeof status === 'number' ? status : null;
}

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (!auth || !(await isAuthenticated(auth.passwordHash))) {
    return NextResponse.json({ error: 'مش مسجّل دخول.' }, { status: 401 });
  }
  if (!isKvConfigured()) return NextResponse.json({ error: 'التخزين الدائم مش متوصل.' }, { status: 503 });
  if (!isPushDeliveryConfigured() || !configurePushDelivery()) {
    return NextResponse.json({ error: 'إعدادات VAPID ناقصة أو غير صالحة.' }, { status: 503 });
  }

  let body: { type?: unknown; title?: unknown; message?: unknown; url?: unknown };
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 4096) return NextResponse.json({ error: 'الرسالة أكبر من المسموح.' }, { status: 413 });
    body = JSON.parse(raw) as typeof body;
  } catch {
    return NextResponse.json({ error: 'بيانات الإشعار غير صالحة.' }, { status: 400 });
  }

  const notificationType = body.type === undefined ? 'custom' : body.type;
  if (notificationType !== 'site-update' && notificationType !== 'custom') {
    return NextResponse.json({ error: 'نوع الإشعار غير معروف.' }, { status: 400 });
  }

  const isSiteUpdate = notificationType === 'site-update';
  const title = isSiteUpdate
    ? 'تم تحديث الموقع'
    : typeof body.title === 'string' ? body.title.trim() : '';
  const message = isSiteUpdate
    ? 'تم تحديث موقع دبلومة القانون الخاص. افتح الموقع للاطلاع على آخر التحديثات.'
    : typeof body.message === 'string' ? body.message.trim() : '';
  const url = isSiteUpdate ? '/' :
    typeof body.url === 'string' && body.url.length <= 500 &&
    /^\/(?!\/)/.test(body.url) && !/[\\\\\r\n]/.test(body.url) ? body.url : '/';

  if (!title || title.length > 80) return NextResponse.json({ error: 'عنوان الإشعار مطلوب وبحد أقصى ٨٠ حرفًا.' }, { status: 400 });
  if (!message || message.length > 220) return NextResponse.json({ error: 'نص الإشعار مطلوب وبحد أقصى ٢٢٠ حرفًا.' }, { status: 400 });

  try {
    const subscriptions = await listPushSubscriptions();
    if (subscriptions.length === 0) return NextResponse.json({ error: 'مفيش أجهزة مشتركة في الإشعارات حتى الآن.' }, { status: 409 });

    let sent = 0;
    let failed = 0;
    const expired = new Set<string>();
    // Keep one current announcement per type instead of stacking repeated broadcasts.
  const tag = isSiteUpdate ? 'site-update' : 'admin-announcement';
    for (let start = 0; start < subscriptions.length; start += 20) {
      const batch = subscriptions.slice(start, start + 20);
      const results = await Promise.all(batch.map(async (subscription) => {
        try {
          await deliverPush(subscription, { title, body: message, url, tag }, 86_400);
          return { ok: true, endpoint: subscription.endpoint };
        } catch (error) {
          const status = statusCodeFromError(error);
          return { ok: false, endpoint: subscription.endpoint, expired: status === 404 || status === 410 };
        }
      }));
      for (const result of results) {
        if (result.ok) sent += 1;
        else {
          failed += 1;
          if (result.expired) expired.add(result.endpoint);
        }
      }
    }
    const removedExpiredSubscriptions = await removePushSubscriptions([...expired]);
    return NextResponse.json({
      ok: true, type: notificationType, total: subscriptions.length, sent, failed, removedExpiredSubscriptions,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return NextResponse.json({ error: 'حصل خطأ أثناء إرسال الإشعار.' }, { status: 500 });
  }
}
