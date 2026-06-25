// Mondo 2026 push notification service worker.
// Receives push events from the backend, displays the notification,
// opens the app on tap. Versioned filename forces SW updates.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = { title: 'Mondo 2026', body: '', url: '/' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload.url ?? '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// Activate as soon as installed — no waiting for tabs to close
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
