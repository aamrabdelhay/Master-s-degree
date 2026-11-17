self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'دبلومة القانون الخاص', body: 'عندك تنبيه جديد لمواعيد الامتحانات.' };
  }
  const title = typeof payload.title === 'string' ? payload.title : 'دبلومة القانون الخاص';
  const body = typeof payload.body === 'string' ? payload.body : 'عندك تنبيه جديد.';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/';

  event.waitUntil((async () => {
    let icon = null;
    try {
      const response = await fetch('/api/site-icon', { cache: 'no-store' });
      if (response.ok) {
        const settings = await response.json();
        if (typeof settings.pwaIconUrl === 'string') {
          const iconUrl = new URL(settings.pwaIconUrl, self.location.origin);
          if (iconUrl.origin === self.location.origin && iconUrl.pathname === '/api/site-icon-image') {
            icon = iconUrl.href;
          }
        }
      }
    } catch {
      // Do not fall back to a bundled legacy logo.
    }

    const notificationOptions = {
      body,
      dir: 'rtl',
      lang: 'ar',
      tag: typeof payload.tag === 'string' ? payload.tag : 'law-diploma-exam',
      renotify: false,
      timestamp: Date.now(),
      data: { url },
    };

    // Both the large notification icon and small badge use the administrator's
    // current uploaded image. No old bundled icon is used as a fallback.
    if (icon) {
      notificationOptions.icon = icon;
      notificationOptions.badge = icon;
    }

    await self.registration.showNotification(title, notificationOptions);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data && typeof event.notification.data.url === 'string'
    ? event.notification.data.url : '/';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus();
      await client.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});
