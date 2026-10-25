// سرویس‌ورکر: اجرای آفلاین + دکمه‌های اعلان
const CACHE = 'monshi-v1';
const ASSETS = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/store.js', 'js/parser.js', 'js/jalali.js', 'js/classifier.js', 'js/analytics.js', 'js/reminders.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// شبکه اول، در صورت قطع اینترنت از حافظه
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && (new URL(e.request.url).origin === location.origin || e.request.url.includes('fonts.g'))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const id = e.notification.data?.id;
  const action = e.action || 'open';
  e.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (clients.length) {
      clients[0].postMessage({ type: 'notification', action, id });
      if (action === 'open') return clients[0].focus();
      return;
    }
    const url = id ? `./?task=${encodeURIComponent(id)}&action=${action}` : './';
    return self.clients.openWindow(url);
  })());
});
