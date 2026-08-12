// Service worker do Portal do Cliente (PWA).
// Estratégia robusta:
//  - Navegação (abrir a página): REDE primeiro (sempre pega a versão nova),
//    caindo para o cache só se estiver offline. Evita "página travada".
//  - Demais assets same-origin: cache primeiro, rede como reserva.
//  - Supabase e outras origens: sempre pela rede (não intercepta).
const CACHE = 'cvf-portal-v6';
const ASSETS = ['./', './index.html', './icon-192.png', './icon-512.png', './manifest.webmanifest', './logo-cvf.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== self.location.origin) return; // deixa o navegador tratar

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((resp) => {
        const cp = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, cp));
        return resp;
      }),
    ),
  );
});
