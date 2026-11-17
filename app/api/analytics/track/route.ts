import { NextRequest, NextResponse } from 'next/server';
import { analyticsReady, recordSiteVisit, saveAnonymousStudyScore, touchActiveVisitor } from '@/lib/analytics';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type TrackBody = { event?: unknown; deviceId?: unknown; score?: unknown; };
function validDeviceId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{20,64}$/.test(value);
}
export async function POST(request: NextRequest) {
  if (!analyticsReady()) return NextResponse.json({ error: 'الإحصائيات غير متاحة حاليًا.' }, { status: 503 });
  let body: TrackBody;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 2048) return NextResponse.json({ error: 'الطلب أكبر من المسموح.' }, { status: 413 });
    body = JSON.parse(raw) as TrackBody;
  } catch { return NextResponse.json({ error: 'بيانات غير صالحة.' }, { status: 400 }); }
  if (!validDeviceId(body.deviceId)) return NextResponse.json({ error: 'معرّف الجهاز غير صالح.' }, { status: 400 });
  if (body.event === 'visit') {
    await recordSiteVisit();
    await touchActiveVisitor(body.deviceId);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (body.event === 'heartbeat') {
    const activeNow = await touchActiveVisitor(body.deviceId);
    return NextResponse.json({ ok: true, activeNow }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (body.event === 'score') {
    if (typeof body.score !== 'number' || !Number.isFinite(body.score) || body.score < 0 || body.score > 100) {
      return NextResponse.json({ error: 'نسبة الإنجاز غير صالحة.' }, { status: 400 });
    }
    const result = await saveAnonymousStudyScore(body.deviceId, body.score);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ error: 'نوع الحدث غير معروف.' }, { status: 400 });
}
