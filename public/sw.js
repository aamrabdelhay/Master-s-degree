self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function getUploadedIcon() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch('/api/site-icon', {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const settings = await response.json();
    if (typeof settings.pwaIconUrl !== 'string') return null;

    const iconUrl = new URL(settings.pwaIconUrl, self.location.origin);
    if (iconUrl.origin !== self.location.origin ||
        iconUrl.pathname !== '/api/site-icon-image') return null;

    return iconUrl.href;
  } catch {
    // Icon lookup is optional: it must never block notification delivery.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: 'دبلومة القانون الخاص',
      body: 'عندك تنبيه جديد لمواعيد الامتحانات.',
    };
  }

  const title = typeof payload.title === 'string'
    ? payload.title : 'دبلومة القانون الخاص';
  const body = typeof payload.body === 'string'
    ? payload.body : 'عندك تنبيه جديد.';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/')
    ? payload.url : '/';

  const baseOptions = {
    body,
    dir: 'rtl',
    lang: 'ar',
    tag: typeof payload.tag === 'string' ? payload.tag : 'law-diploma-exam',
    renotify: false,
    timestamp: Date.now(),
    data: { url },
  };

  event.waitUntil((async () => {
    const icon = await getUploadedIcon();

    if (icon) {
      try {
        await self.registration.showNotification(title, {
          ...baseOptions,
          icon,
          badge: icon,
        });
        return;
      } catch (error) {
        // If the uploaded image is unavailable or invalid, still show the
        // notification without an icon rather than dropping the push.
        console.warn('[push] Uploaded icon failed; showing notification without icon.', error);
      }
    }

    await self.registration.showNotification(title, baseOptions);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data && typeof event.notification.data.url === 'string'
    ? event.notification.data.url : '/';
  const target = new URL(path, self.location.origin).href;

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    for (const client of clientsList) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus();
      await client.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});
