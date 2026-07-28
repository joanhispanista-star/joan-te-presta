/* Service worker de la app del socio.
   Objetivo: que abra aunque el cliente no tenga datos. Su historial ya viaja
   dentro del enlace, así que con la página en caché ve todo sin internet.

   Estrategia: la página y el motor van "red primero" (así una versión nueva
   llega apenas hay señal), y lo demás "caché primero" (los iconos no cambian). */
const CACHE = 'socio-v3';
const BASE = new URL('./', self.location).pathname;
const ARCHIVOS = [
  'socio.html', 'motor.js', 'socio.webmanifest',
  'icono-192.png', 'icono-512.png', 'icono-maskable-512.png', 'icono-180.png'
].map(f => BASE + f);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // Sin reventar la instalación si algún archivo no está: mejor una app
      // a medias en caché que ninguna.
      .then(c => Promise.all(ARCHIVOS.map(f => c.add(f).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase y demás, de largo

  const frescoPrimero = req.mode === 'navigate' || /\.(html|js|webmanifest)$/.test(url.pathname);

  if (frescoPrimero) {
    e.respondWith(
      fetch(req)
        .then(r => {
          const copia = r.clone();
          caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
          return r;
        })
        .catch(() => caches.match(req).then(r => r || caches.match(BASE + 'socio.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
      return res;
    }))
  );
});
