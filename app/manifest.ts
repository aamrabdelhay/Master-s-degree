import type { MetadataRoute } from 'next';
import { getVersionedPwaIconUrl } from '@/lib/pwa-icon';
import { getSite } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const site = await getSite();
  const customIcon = getVersionedPwaIconUrl(site.pwaIconUrl);
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
    ...(customIcon
      ? {
          icons: [
            { src: customIcon, sizes: '512x512', type: contentType, purpose: 'any' },
          ],
        }
      : {}),
  };
}
