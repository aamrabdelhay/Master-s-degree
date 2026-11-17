import { NextResponse } from 'next/server';
import { getVersionedPwaIconUrl } from '@/lib/pwa-icon';
import { getSite } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const site = await getSite();
  return NextResponse.json(
    { pwaIconUrl: getVersionedPwaIconUrl(site.pwaIconUrl) },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
