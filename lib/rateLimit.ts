import { kvGetRaw, kvIncr, kvDel } from './kv';

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_SECONDS = 10 * 60; // 10 دقايق
export const LOGIN_BLOCK_SECONDS = 15 * 60; // 15 دقيقة قفل

function keyFor(ip: string): string {
  return `lawdiploma:login-attempts:${ip}`;
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || headers.get('cf-connecting-ip')?.trim() || 'unknown';
}

export type RateLimitState = {
  allowed: boolean;
  attemptsLeft: number;
  retryAfterSeconds: number;
};

/** فحص الحد الأقصى لمحاولات الدخول الغلط */
export async function checkLoginRateLimit(ip: string): Promise<RateLimitState> {
  const raw = await kvGetRaw(keyFor(ip));
  const attempts = Number(raw ?? '0') || 0;
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    return { allowed: false, attemptsLeft: 0, retryAfterSeconds: LOGIN_BLOCK_SECONDS };
  }
  return {
    allowed: true,
    attemptsLeft: MAX_LOGIN_ATTEMPTS - attempts,
    retryAfterSeconds: 0,
  };
}

/** تسجيل محاولة دخول فاشلة */
export async function registerFailedAttempt(ip: string): Promise<void> {
  await kvIncr(keyFor(ip), LOGIN_BLOCK_SECONDS);
}

/** تصفير العدّاد بعد دخول ناجح */
export async function clearLoginAttempts(ip: string): Promise<void> {
  await kvDel(keyFor(ip));
}
