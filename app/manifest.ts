import type { MetadataRoute } from 'next';
import { getSite } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const site = await getSite();
  const customIcon = site.pwaIconUrl ? '/api/site-icon-image' : null;
  const contentType = site.pwaIconMime || 'image/png';

  return {
    id: '/',
    name: site.headerTitle || 'دبلومة القانون الخاص — جامعة العاصمة',
    short_name: 'دبلومة القانون',
    description: 'جدول الامتحانات ومتابعة المذاكرة لدبلومة القانون الخاص',
    lang: 'ar',
    dir: 'rtl',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f1f5f9',
    theme_color: '#0f172a',
    icons: customIcon
      ? [
          { src: customIcon, sizes: '192x192', type: contentType, purpose: 'any' },
          { src: customIcon, sizes: '512x512', type: contentType, purpose: 'any' },
          { src: customIcon, sizes: '512x512', type: contentType, purpose: 'maskable' },
        ]
      : [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
  };
}
