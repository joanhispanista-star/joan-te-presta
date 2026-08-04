/* Service worker único de Tu Garantía.

   ANTES ERAN DOS, uno por app, y no podía seguir así. Un service worker solo puede
   interceptar peticiones de su propia carpeta hacia abajo. Con el Panel en /panel/ y
   la app del socio en /app/, un service worker dentro de /panel/ podía GUARDAR
   ../app/motor.js en su caché pero nunca servirlo: la petición cae fuera de su
   alcance y se va derecha a la red. Resultado: sin señal, el Panel abría en blanco.
   Y motor.js y puente.js los comparten las dos apps a propósito, para que no haya
   dos verdades sobre las mismas reglas.

   Desde la raíz, el alcance cubre todo el sitio y el problema desaparece.

   ESTRATEGIA
   · Las páginas y los scripts van RED PRIMERO: una versión nueva llega apenas hay
     señal, que es lo que hace falta mientras esto se mueve tanto.
   · Los iconos y las imágenes van CACHÉ PRIMERO: no cambian casi nunca.
   · Los DATOS no pasan por aquí. Viven en localStorage del dispositivo y en Supabase.

   AL SUBIR UNA VERSIÓN NUEVA hay que subir el número de CACHE. Si no, los teléfonos
   que ya tienen la app siguen mostrando los iconos viejos. */

const CACHE = 'tugarantia-v1';
const BASE = new URL('./', self.location).pathname;

const ARCHIVOS = [
  '',                                   // la raíz, o sea la web pública
  'index.html',
  'portada.png',
  'legal/privacidad.html',
  'legal/terminos.html',
  'app/socio.html',
  'app/motor.js',
  'app/puente.js',
  'app/app.webmanifest',
  'app/icono-180.png',
  'app/icono-192.png',
  'app/icono-512.png',
  'app/icono-maskable-512.png',
  'panel/crm.html',
  'panel/panel.webmanifest',
  'panel/panel-180.png',
  'panel/panel-192.png',
  'panel/panel-512.png',
  'panel/panel-maskable-512.png'
].map(f => BASE + f);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // Sin reventar la instalación si algún archivo falta: mejor una app a medias
      // en caché que ninguna.
      .then(c => Promise.all(ARCHIVOS.map(f => c.add(f).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

/* Solo se borran las cachés propias. caches.keys() lista las de TODO el dominio: si
   algún día esto convive con otra cosa en la misma dirección, sin el filtro por
   prefijo le borraríamos la suya. */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(
        ks.filter(k => k.startsWith('tugarantia-') && k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase y las tipografías, de largo

  const frescoPrimero = req.mode === 'navigate' ||
    /\.(html|js|webmanifest)$/.test(url.pathname);

  if (frescoPrimero) {
    e.respondWith(
      fetch(req)
        .then(r => {
          const copia = r.clone();
          caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
          return r;
        })
        /* Sin señal: lo guardado. Y si la página pedida no estaba guardada, la web
           pública, que es la que explica qué es esto y cómo pedir ayuda. */
        .catch(() => caches.match(req).then(r => r || caches.match(BASE + 'index.html')))
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
