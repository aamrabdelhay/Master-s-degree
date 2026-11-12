import { NextRequest, NextResponse } from 'next/server';
import { getAuth, getSite, saveSite } from '@/lib/store';
import { isAuthenticated } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** قراءة عامة لبيانات الموقع */
export async function GET() {
  const site = await getSite();
  return NextResponse.json(site, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

/** حفظ بيانات الموقع (للأدمن فقط) */
export async function PUT(request: NextRequest) {
  const auth = await getAuth();
  if (!auth || !(await isAuthenticated(auth.passwordHash))) {
    return NextResponse.json({ error: 'مش مسجّل دخول.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'بيانات غير صحيحة' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'بيانات غير صحيحة' }, { status: 400 });
  }

  const saved = await saveSite(body);
  return NextResponse.json(
    { ok: true, site: saved },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
