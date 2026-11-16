import { NextRequest, NextResponse } from 'next/server';
import { isKvConfigured } from '@/lib/kv';
import { isSafePushEndpoint, removePushSubscription } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  if (!isKvConfigured()) return NextResponse.json({ error: 'التخزين الدائم مش متوصل دلوقتي.' }, { status: 503 });
  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 4096) return NextResponse.json({ error: 'حجم الطلب أكبر من المسموح.' }, { status: 413 });
    body = JSON.parse(raw) as unknown;
  } catch { return NextResponse.json({ error: 'بيانات إلغاء الاشتراك غير صالحة.' }, { status: 400 }); }
  if (typeof body !== 'object' || body === null || Array.isArray(body) ||
      !isSafePushEndpoint((body as Record<string, unknown>).endpoint)) {
    return NextResponse.json({ error: 'عنوان الاشتراك غير صالح.' }, { status: 400 });
  }
  await removePushSubscription((body as { endpoint: string }).endpoint);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
