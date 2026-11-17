import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSite } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const site = await getSite();
  const iconVersion = site.pwaIconUrl
    ? createHash('sha256').update(site.pwaIconUrl).digest('hex').slice(0, 12)
    : null;
  return NextResponse.json(
    { pwaIconUrl: iconVersion ? `/api/site-icon-image?v=${iconVersion}` : null },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
