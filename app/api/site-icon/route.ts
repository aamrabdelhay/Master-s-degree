import { NextResponse } from 'next/server';
import { getSite } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const site = await getSite();
  return NextResponse.json(
    { pwaIconUrl: site.pwaIconUrl || null },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
