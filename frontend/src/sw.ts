/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Navigation fallback so deep-links + offline still resolve to the SPA shell
registerRoute(new NavigationRoute(async () => {
  const cache = await caches.match('/index.html');
  return cache ?? fetch('/index.html');
}));

registerRoute(/^\/api\/matches/, new NetworkFirst({ cacheName: 'matches-cache' }), 'GET');

// ── Push notifications ───────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: { title: string; body: string; url?: string } = { title: 'Mondo 2026', body: '', url: '/' };
  try { payload = { ...payload, ...event.data.json() }; }
  catch { payload.body = event.data.text(); }

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
  const url = (event.notification.data as { url?: string })?.url ?? '/';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      if ('focus' in c) {
        await (c as WindowClient).navigate(url);
        return (c as WindowClient).focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
