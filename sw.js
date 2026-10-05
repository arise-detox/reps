/* REPS - service worker : hors-ligne.
   - L'appli (HTML, CSS, JS, icônes) est préchargée dans un cache versionné ; le nom du cache change à chaque version.
   - La page d'accueil est servie par le réseau d'abord (3,5 s) puis par le cache : une mise à jour apparaît dès qu'il y a du réseau.
   - La bibliothèque de détection et le modèle (jsDelivr, storage.googleapis.com, environ 15 Mo) sont gardés dans un cache à part
     après le premier chargement, pour fonctionner sans réseau ensuite. Ce cache survit aux mises à jour de l'appli.
   Préfixes propres à REPS : ne touche jamais aux caches des autres applis du même domaine (ARISE, ROAD TO GI, Ma Routine…). */
const VERSION = 'v1.0.0';
const PREFIX = 'reps-' + new URL(self.registration.scope).pathname + '-';
const CACHE = PREFIX + VERSION;
const ML = 'reps-ml-v1';
const SHELL = ['./', './index.html', './styles.css', './engine.js', './wod.js', './audio.js', './vision.js', './session.js', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];
const ML_HOSTS = ['cdn.jsdelivr.net', 'storage.googleapis.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function networkFirst(request, ms) {
  return new Promise(resolve => {
    let settled = false;
    const fallback = () => caches.match(request, { ignoreSearch: true }).then(r => r || caches.match(new URL('./index.html', self.registration.scope)));
    const timer = setTimeout(() => { if (!settled) fallback().then(r => { if (r && !settled) { settled = true; resolve(r); } }); }, ms);
    fetch(request).then(res => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(request, copy)); }
      resolve(res);
    }).catch(() => { clearTimeout(timer); if (!settled) { settled = true; fallback().then(resolve); } });
  });
}

self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (ML_HOSTS.includes(url.hostname)) {
    event.respondWith(caches.open(ML).then(cache => cache.match(req).then(hit => hit || fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (req.mode === 'navigate') { event.respondWith(networkFirst(req, 3500)); return; }
  event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })));
});
