// Offline support for the app shell. Google sign-in and Drive requests always go to the network.
const VERSION = 'uke-tabs-v2';
const SHELL = [
  './', 'index.html', 'app.css', 'config.js', 'manifest.webmanifest',
  'js/pitch.js', 'js/audio.js', 'js/drive.js', 'js/tabtext.js', 'js/tuner.js', 'js/viewer.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png',
];
const CDN = ['https://cdnjs.cloudflare.com/', 'https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  const sameOrigin = url.startsWith(self.location.origin);
  if (!sameOrigin && !CDN.some((p) => url.startsWith(p))) return;

  // Network first (so updates show up), falling back to the cache when offline.
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: sameOrigin }).then((r) => r || caches.match('index.html')))
  );
});
