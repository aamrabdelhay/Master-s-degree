// Notification images are static files bundled with the site, so showing a push
// never depends on a network lookup (the old lookup timed out and dropped the icon).
const NOTIFICATION_ICON = '/icons/icon-192.png';
const NOTIFICATION_BADGE = '/icons/badge-96.png';

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
    payload = {
      title: 'دبلومة القانون الخاص',
      body: 'عندك تنبيه جديد لمواعيد الامتحانات.',
    };
  }

  const title = typeof payload.title === 'string' && payload.title
    ? payload.title : 'دبلومة القانون الخاص';
  const body = typeof payload.body === 'string' && payload.body
    ? payload.body : 'عندك تنبيه جديد.';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/')
    ? payload.url : '/';
  const tag = typeof payload.tag === 'string' && payload.tag
    ? payload.tag : 'law-diploma-' + Date.now();

  const options = {
    body,
    dir: 'rtl',
    lang: 'ar',
    tag,
    // Same tag replaces the old notification; renotify makes sure it still alerts.
    renotify: true,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    timestamp: Date.now(),
    data: { url },
  };

  event.waitUntil((async () => {
    try {
      await self.registration.showNotification(title, options);
    } catch (error) {
      // Never drop a push because of an optional field (e.g. an unsupported badge).
      console.warn('[push] showNotification failed, retrying with minimal options.', error);
      await self.registration.showNotification(title, { body, tag, data: { url } });
    }
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
