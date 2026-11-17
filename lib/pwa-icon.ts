import { createHash } from 'node:crypto';

/**
 * Creates a new same-origin icon URL whenever the uploaded Blob URL changes.
 * The version query prevents browsers and installed PWAs from reusing an old
 * immutable icon after an administrator uploads a replacement.
 */
export function getVersionedPwaIconUrl(sourceUrl?: string | null): string | null {
  if (!sourceUrl) return null;
  const version = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 12);
  return '/api/site-icon-image?v=' + version;
}
