import { NextRequest, NextResponse } from 'next/server';
import { getSite } from '@/lib/store';
import { isKvConfigured } from '@/lib/kv';
import { isPushDeliveryConfigured, isSafePushEndpoint, MAX_PUSH_SUBSCRIPTIONS, upsertPushSubscription, type StoredPushSubscription } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export async function POST(request: NextRequest) {
  if (!isKvConfigured()) return NextResponse.json({ error: 'التخزين الدائم مش متوصل دلوقتي.' }, { status: 503 });
  if (!isPushDeliveryConfigured()) return NextResponse.json({ error: 'خدمة التنبيهات لسه مش متجهزة على الموقع.' }, { status: 503 });
  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 16_384) return NextResponse.json({ error: 'حجم الطلب أكبر من المسموح.' }, { status: 413 });
    body = JSON.parse(raw) as unknown;
  } catch { return NextResponse.json({ error: 'بيانات الاشتراك غير صالحة.' }, { status: 400 }); }
  if (!isRecord(body) || !isRecord(body.subscription) || !isRecord(body.preference)) {
    return NextResponse.json({ error: 'بيانات الاشتراك ناقصة.' }, { status: 400 });
  }
  const endpoint = body.subscription.endpoint;
  const keys = body.subscription.keys;
  if (!isSafePushEndpoint(endpoint) || !isRecord(keys) ||
      typeof keys.p256dh !== 'string' || keys.p256dh.length < 32 || keys.p256dh.length > 256 ||
      typeof keys.auth !== 'string' || keys.auth.length < 16 || keys.auth.length > 128) {
    return NextResponse.json({ error: 'بيانات الاشتراك أو عنوانه غير صالح.' }, { status: 400 });
  }
  const site = await getSite();
  const validIds = new Set(site.subjects.map((subject) => subject.id));
  let subjectIds: string[] | null = null;
  if (body.preference.mode === 'selected') {
    const requested = body.preference.subjectIds;
    if (!Array.isArray(requested) || requested.length === 0 || requested.length > 30 ||
        !requested.every((id) => typeof id === 'string' && id.length <= 64 && validIds.has(id))) {
      return NextResponse.json({ error: 'اختار مادة واحدة على الأقل للتنبيه.' }, { status: 400 });
    }
    subjectIds = [...new Set(requested as string[])];
  } else if (body.preference.mode !== 'all') {
    return NextResponse.json({ error: 'اختيار المواد غير مفهوم.' }, { status: 400 });
  }
  const now = new Date().toISOString();
  const subscription: StoredPushSubscription = {
    endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, subjectIds, createdAt: now, updatedAt: now,
  };
  const result = await upsertPushSubscription(subscription);
  if (!result.saved) return NextResponse.json({
    error: 'وصلنا للحد الأقصى من الأجهزة المسجلة (' + MAX_PUSH_SUBSCRIPTIONS + ').',
  }, { status: 429 });
  return NextResponse.json({ ok: true, count: result.count }, {
    status: 201, headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
