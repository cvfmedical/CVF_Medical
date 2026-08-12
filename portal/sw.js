// Service worker do Portal do Cliente (PWA).
// Cacheia só a "casca" (index + ícones) para instalar/abrir offline.
// Requisições ao Supabase (outra origem) vão sempre pela rede.
const CACHE = 'cvf-portal-v2';
const ASSETS = ['./', './index.html', './icon-192.png', './icon-512.png', './manifest.webmanifest', './logo-cvf.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method === 'GET' && u.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((r) =>
        r || fetch(e.request).then((resp) => {
          const cp = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, cp));
          return resp;
        }).catch(() => caches.match('./index.html')),
      ),
    );
  }
});
