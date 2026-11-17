import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { getSite } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Public same-origin delivery for the PWA icon.
 * The source object stays in private Blob storage; visitors only receive the image bytes.
 */
export async function GET() {
  const site = await getSite();
  if (!site.pwaIconUrl) {
    return new NextResponse('Not found', { status: 404 });
  }

  let blobUrl: URL;
  try {
    blobUrl = new URL(site.pwaIconUrl);
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  if (blobUrl.hostname.endsWith('.public.blob.vercel-storage.com')) {
    return NextResponse.redirect(site.pwaIconUrl);
  }

  if (!blobUrl.hostname.endsWith('.private.blob.vercel-storage.com')) {
    return new NextResponse('Not found', { status: 404 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return new NextResponse('Icon storage is not configured', { status: 503 });
  }

  try {
    const result = await get(blobUrl.pathname.replace(/^\/+/, ''), {
      access: 'private',
      token,
    });

    if (!result || result.statusCode !== 200) {
      return new NextResponse('Not found', { status: 404 });
    }

    return new Response(result.stream, {
      headers: {
        'Content-Type': site.pwaIconMime || result.blob.contentType || 'image/png',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[pwa-icon-delivery] Blob read failed:', error);
    return new NextResponse('Unable to load icon', { status: 502 });
  }
}
