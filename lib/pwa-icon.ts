import { createHash } from 'node:crypto';

export const PWA_ICON_STORAGE_KEY = 'lawdiploma:pwa-icon:v1';

export type StoredPwaIcon = {
  version: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  base64: string;
  uploadedAt: string;
};

export function getPwaIconUrl(version: string): string {
  return '/api/site-icon-image?v=' + encodeURIComponent(version);
}

export function getVersionedPwaIconUrl(sourceUrl?: string | null): string | null {
  if (!sourceUrl) return null;
  if (/^\/api\/site-icon-image\?v=[a-f0-9]{12}$/i.test(sourceUrl)) return sourceUrl;
  const version = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 12);
  return getPwaIconUrl(version);
}
