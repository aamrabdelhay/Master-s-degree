import { NextRequest, NextResponse } from 'next/server';
import { kvGetJson } from '@/lib/kv';
import { getSite } from '@/lib/store';
import { getPwaIconUrl, PWA_ICON_STORAGE_KEY, type StoredPwaIcon } from '@/lib/pwa-icon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const requestedVersion = request.nextUrl.searchParams.get('v');
  if (!requestedVersion || !/^[a-f0-9]{12}$/i.test(requestedVersion)) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const [site, icon] = await Promise.all([
      getSite(),
      kvGetJson<StoredPwaIcon>(PWA_ICON_STORAGE_KEY),
    ]);

    if (
      !icon ||
      icon.version !== requestedVersion ||
      site.pwaIconUrl !== getPwaIconUrl(icon.version) ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(icon.contentType)
    ) {
      return new NextResponse('Not found', { status: 404 });
    }

    const bytes = Buffer.from(icon.base64, 'base64');
    if (bytes.length === 0 || bytes.length > 4 * 1024 * 1024) {
      return new NextResponse('Not found', { status: 404 });
    }

    return new Response(bytes, {
      headers: {
        'Content-Type': icon.contentType,
        'Content-Length': String(bytes.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"${icon.version}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[pwa-icon-delivery] Database read failed:', error);
    return new NextResponse('Unable to load icon', { status: 503 });
  }
}
