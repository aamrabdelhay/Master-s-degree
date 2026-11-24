import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { kvSetJson } from '@/lib/kv';
import { getAuth } from '@/lib/store';
import { isAuthenticated } from '@/lib/auth';
import { getPwaIconUrl, PWA_ICON_STORAGE_KEY, type StoredPwaIcon } from '@/lib/pwa-icon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

function matchesImageSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/png') {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (mime === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === 'image/webp') {
    return bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }
  return false;
}

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (!auth || !(await isAuthenticated(auth.passwordHash))) {
    return NextResponse.json({ error: 'انتهت جلسة الأدمن. سجّل الدخول مرة أخرى.' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'ملف الصورة غير صالح.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'لم يتم اختيار صورة.' }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: 'حجم الصورة يجب ألا يتجاوز ٤ ميجابايت.' }, { status: 413 });
  }

  const mime = file.type;
  if (mime !== 'image/png' && mime !== 'image/jpeg' && mime !== 'image/webp') {
    return NextResponse.json({ error: 'الصيغ المدعومة هي PNG وJPG وWEBP فقط.' }, { status: 415 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesImageSignature(bytes, mime)) {
    return NextResponse.json({ error: 'محتوى الملف لا يطابق صيغة الصورة.' }, { status: 400 });
  }

  const version = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const icon: StoredPwaIcon = {
    version,
    contentType: mime,
    base64: Buffer.from(bytes).toString('base64'),
    uploadedAt: new Date().toISOString(),
  };

  try {
    await kvSetJson(PWA_ICON_STORAGE_KEY, icon);
    return NextResponse.json(
      { ok: true, url: getPwaIconUrl(version), contentType: mime },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    console.error('[pwa-icon-upload] Database save failed:', error);
    return NextResponse.json(
      { error: 'تعذّر حفظ صورة التطبيق في قاعدة البيانات. تأكد من اتصال Neon ثم حاول مرة أخرى.' },
      { status: 503 },
    );
  }
}
