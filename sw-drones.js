/* Service worker de Drones de Combate — instalable + arranque de la página offline.
   Red primero; si falla, sirve la copia en caché de la página. Los recursos
   grandes (motor 3D, física, modelos) se bajan de sus CDN (necesitan internet). */
const CACHE = 'drones-v0_14';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  // cachea el cascarón (página, manifiesto, iconos) para poder abrir la app offline
  const isShell = /drones\.html|drones\.webmanifest|icon-\d+\.png/.test(url);
  e.respondWith(
    fetch(req).then(r => {
      if (isShell && r && r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
      return r;
    }).catch(() => caches.match(req))
  );
});
