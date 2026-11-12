import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';

const scryptAsync = promisify(scrypt);

export const SESSION_COOKIE = 'lawdiploma_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 ساعة

/** تشفير كلمة المرور بـ scrypt (مش نص صريح أبداً) */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password.normalize('NFKC'), salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const derived = (await scryptAsync(password.normalize('NFKC'), salt, 64)) as Buffer;
    const expected = Buffer.from(hash, 'hex');
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * مفتاح توقيع الجلسة مشتق من الهاش المخزّن + سر اختياري.
 * يعني لو الباسورد اتغيّر، كل الجلسات القديمة تتلغي تلقائياً.
 */
function sessionKey(passwordHash: string): Buffer {
  const secret = process.env.ADMIN_SESSION_SECRET || 'lawdiploma-fallback-secret';
  return createHash('sha256').update(`${secret}::${passwordHash}`).digest();
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function createSessionToken(passwordHash: string): string {
  const payload = JSON.stringify({
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    v: 1,
  });
  const encoded = base64url(payload);
  const signature = createHmac('sha256', sessionKey(passwordHash)).update(encoded).digest();
  return `${encoded}.${base64url(signature)}`;
}

export function verifySessionToken(token: string | undefined, passwordHash: string): boolean {
  if (!token) return false;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return false;
  try {
    const expected = createHmac('sha256', sessionKey(passwordHash)).update(encoded).digest();
    const provided = Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (expected.length !== provided.length) return false;
    if (!timingSafeEqual(expected, provided)) return false;
    const payload = JSON.parse(
      Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
};

/** هل الزائر الحالي أدمن مسجّل دخول؟ */
export async function isAuthenticated(passwordHash: string): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value, passwordHash);
}
