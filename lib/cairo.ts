/**
 * كل حسابات الوقت بتتعمل بتوقيت القاهرة (Africa/Cairo) على السيرفر،
 * فالعد التنازلي بيبقى واحد لكل الزوار مهما كان توقيت جهازهم.
 *
 * بنخزن الموعد كوقت محلي "YYYY-MM-DDTHH:mm" وبعدين بنحوّله لـ UTC
 * باستخدام قاعدة IANA (Africa/Cairo) اللي بتتعامل مع التوقيت الصيفي تلقائياً.
 */

export const CAIRO_TZ = 'Africa/Cairo';

const WALL_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const cairoFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CAIRO_TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** فرق التوقيت (بالميللي ثانية) بين القاهرة و UTC في لحظة معينة */
function cairoOffsetMs(instant: Date): number {
  const parts = cairoFormatter.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  const instantSec = Math.floor(instant.getTime() / 1000) * 1000;
  return asUtc - instantSec;
}

/** هل النص وقت محلي صحيح؟ */
export function isValidCairoWallTime(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  const match = WALL_TIME_RE.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12) return false;
  if (hour > 23 || minute > 59) return false;
  // التأكد إن اليوم موجود فعلاً في الشهر (مش 31 فبراير مثلاً)
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

/**
 * يحوّل وقت القاهرة المحلي لـ ISO/UTC.
 * بيرجع null لو النص مش صالح.
 */
export function cairoWallToUtcIso(wall: string | null | undefined): string | null {
  if (!isValidCairoWallTime(wall)) return null;
  const match = WALL_TIME_RE.exec((wall as string).trim())!;
  const naive = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );

  // خطوتين لتغطية لحظات تغيير التوقيت الصيفي
  let offset = cairoOffsetMs(new Date(naive));
  let utc = naive - offset;
  offset = cairoOffsetMs(new Date(utc));
  utc = naive - offset;

  return new Date(utc).toISOString();
}

const labelFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: CAIRO_TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

/** نص عربي لعرض الموعد بتوقيت القاهرة */
export function formatCairoLabel(wall: string | null | undefined): string | null {
  const iso = cairoWallToUtcIso(wall);
  if (!iso) return null;
  try {
    return labelFormatter.format(new Date(iso));
  } catch {
    return null;
  }
}

/** يحوّل ISO/UTC لوقت محلي بالقاهرة بشكل "YYYY-MM-DDTHH:mm" (للاستخدام في الأدمن) */
export function utcIsoToCairoWall(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = cairoFormatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}
