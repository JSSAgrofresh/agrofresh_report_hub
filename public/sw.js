/* Service worker mínimo: lo que Chrome pide para poder instalar el sistema como app.
   NO guarda datos ni respuestas de la API (los resultados de laboratorio no deben quedar en caché):
   todo va directo a la red. Solo si no hay internet al abrir una pantalla, muestra un aviso sencillo. */
const CACHE = 'report-hub-offline-v1'
const AVISO = '/offline.html'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(AVISO)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return // lo demás sigue su curso normal, sin tocar
  e.respondWith(fetch(e.request).catch(() => caches.match(AVISO)))
})
