import { NextRequest, NextResponse } from 'next/server';
import { getAuth, setAuth } from '@/lib/store';
import {
  SESSION_COOKIE,
  createSessionToken,
  hashPassword,
  isAuthenticated,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (!auth || !(await isAuthenticated(auth.passwordHash))) {
    return NextResponse.json({ error: 'مش مسجّل دخول.' }, { status: 401 });
  }

  let body: { current?: unknown; next?: unknown; confirm?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'بيانات غير صحيحة' }, { status: 400 });
  }

  const current = typeof body.current === 'string' ? body.current : '';
  const next = typeof body.next === 'string' ? body.next : '';
  const confirm = typeof body.confirm === 'string' ? body.confirm : '';

  if (!(await verifyPassword(current, auth.passwordHash))) {
    return NextResponse.json({ error: 'كلمة المرور الحالية غلط.' }, { status: 401 });
  }
  if (next.length < 8) {
    return NextResponse.json(
      { error: 'كلمة المرور الجديدة لازم تكون 8 حروف على الأقل.' },
      { status: 400 },
    );
  }
  if (next !== confirm) {
    return NextResponse.json({ error: 'كلمة المرور الجديدة والتأكيد غير متطابقين.' }, { status: 400 });
  }

  const passwordHash = await hashPassword(next);
  await setAuth({
    passwordHash,
    createdAt: auth.createdAt,
    updatedAt: new Date().toISOString(),
  });

  // الجلسات القديمة بتبقى لاغية تلقائياً، فبنعمل جلسة جديدة
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionToken(passwordHash),
    ...sessionCookieOptions,
  });
  return response;
}
