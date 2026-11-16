'use client';

import { useEffect } from 'react';

/**
 * Registers the site's service worker without adding any visible UI.
 * This enables the browser to offer installation as a standalone PWA.
 */
export default function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    let cancelled = false;

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        if (cancelled) return;
        void registration.update().catch(() => undefined);
      })
      .catch((error: unknown) => {
        // PWA support must never prevent the public timetable from working.
        console.error('Service worker registration failed:', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
