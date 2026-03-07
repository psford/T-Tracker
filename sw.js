/* Minimal service worker for PWA installability and notification support.
   No caching — app needs live SSE data. */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Only handle same-origin requests. Let cross-origin (MBTA API SSE) pass through
  // natively — intercepting SSE streams with respondWith(fetch()) breaks streaming.
  if (new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(fetch(event.request));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow('/');
    })
  );
});
