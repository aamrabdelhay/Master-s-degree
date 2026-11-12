import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/store';
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth';
import {
  LOGIN_BLOCK_SECONDS,
  checkLoginRateLimit,
  clearLoginAttempts,
  clientIp,
  registerFailedAttempt,
} from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers);
  const limit = await checkLoginRateLimit(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `محاولات كتير غلط. جرّب تاني بعد ${Math.ceil(
          limit.retryAfterSeconds / 60,
        )} دقيقة.`,
      },
      { status: 429 },
    );
  }

  let body: { password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'بيانات غير صحيحة' }, { status: 400 });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const auth = await getAuth();

  if (!auth) {
    return NextResponse.json(
      { error: 'مفيش كلمة مرور متسجلة بعد.', notSet: true },
      { status: 400 },
    );
  }

  const ok = password.length > 0 && (await verifyPassword(password, auth.passwordHash));
  if (!ok) {
    await registerFailedAttempt(ip);
    const left = Math.max(limit.attemptsLeft - 1, 0);
    const leftLabel =
      left === 0
        ? ''
        : left === 1
          ? 'فاضلة محاولة واحدة'
          : left === 2
            ? 'فاضل محاولتين'
            : `فاضل ${left} محاولات`;
    return NextResponse.json(
      {
        error:
          left > 0
            ? `كلمة المرور غلط. ${leftLabel} قبل إغلاق الدخول مؤقتاً.`
            : `كلمة المرور غلط. الدخول اتقفل مؤقتاً لمدة ${Math.ceil(
                LOGIN_BLOCK_SECONDS / 60,
              )} دقيقة.`,
      },
      { status: 401 },
    );
  }

  await clearLoginAttempts(ip);

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: createSessionToken(auth.passwordHash),
    ...sessionCookieOptions,
  });
  return response;
}
