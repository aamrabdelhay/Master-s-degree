import { NextResponse } from 'next/server';
import { getAuth } from '@/lib/store';
import { isAuthenticated } from '@/lib/auth';
import { analyticsReady, getAnalyticsSnapshot } from '@/lib/analytics';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await getAuth();
  if (!auth || !(await isAuthenticated(auth.passwordHash))) return NextResponse.json({ error: 'مش مسجّل دخول.' }, { status: 401 });
  if (!analyticsReady()) return NextResponse.json({ error: 'التخزين الدائم للإحصائيات غير متصل.' }, { status: 503 });
  const snapshot = await getAnalyticsSnapshot();
  return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
