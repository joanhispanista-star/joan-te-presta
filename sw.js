/* PlataDeuna · Panel — service worker (funcionamiento sin internet)

   OJO: acá el panel va CACHÉ PRIMERO, incluido crm.html. Cada vez que se publique una
   versión nueva hay que subirle el número a CACHE, porque "activate" borra las cachés
   con otro nombre y ese es el único momento en que el navegador suelta la copia vieja.
   Sin eso, un navegador que ya abrió el panel se queda con la versión anterior para siempre. */
const CACHE = 'panel-plata-v2';
const ASSETS = [
  'crm.html', 'index.html', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const fallback = await caches.match('crm.html');
      if (fallback) return fallback;
      throw err;
    }
  })());
});
