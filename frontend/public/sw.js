// Minimal service worker för fältrapport-PWA:n (/report) — nätverk först, faller tillbaka på
// cache vid utebliven anslutning. Ingen build-tids precache-lista (Vite hashar filnamn per
// build); cachen fylls i stället dynamiskt av vad som faktiskt hämtats under en lyckad session,
// så sidan går att öppna igen utan täckning efter första besöket.
const CACHE = 'odin-field-report-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('/report')))
  );
});
