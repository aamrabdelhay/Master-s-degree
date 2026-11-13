import { NextRequest, NextResponse } from 'next/server';
import { getAuth, setAuth } from '@/lib/store';
import {
  SESSION_COOKIE,
  createSessionToken,
  hashPassword,
  sessionCookieOptions,
} from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { password?: unknown; confirm?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'بيانات غير صحيحة' }, { status: 400 });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const confirm = typeof body.confirm === 'string' ? body.confirm : '';

  const existing = await getAuth();
  if (existing) {
    return NextResponse.json(
      { error: 'كلمة المرور متسجلة بالفعل، سجّل الدخول.' },
      { status: 409 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: 'كلمة المرور لازم تكون 8 حروف على الأقل.' },
      { status: 400 },
    );
  }
  if (password !== confirm) {
    return NextResponse.json({ error: 'كلمة المرور والتأكيد غير متطابقين.' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  try {
    await setAuth({ passwordHash, createdAt: now, updatedAt: now });
  } catch (error) {
    console.error('Admin password setup could not be persisted', error);
    return NextResponse.json(
      { error: 'تعذّر حفظ كلمة المرور في التخزين الدائم. تأكد من اتصال التخزين ثم حاول مرة أخرى.' },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionToken(passwordHash),
    ...sessionCookieOptions,
  });
  return response;
}
