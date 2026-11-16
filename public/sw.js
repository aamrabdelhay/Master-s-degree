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
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: '/icon-192.png', badge: '/icon-192.png',
    dir: 'rtl', lang: 'ar',
    tag: typeof payload.tag === 'string' ? payload.tag : 'law-diploma-exam',
    renotify: false, data: { url },
  }));
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
