// Офлайн: оболонка — cache-first, контент тижнів — network-first (щоб нові тижні з'являлись одразу).
const VERSION = 'pewnie-v2';
const SHELL = [
  './', 'index.html', 'css/app.css', 'css/fonts.css', 'manifest.webmanifest', 'assets/icon.svg',
  'js/app.js', 'js/textutil.js', 'js/util.js', 'js/store.js', 'js/content.js', 'js/speech.js', 'js/analyze.js', 'js/ui.js',
  'js/pages.js', 'js/speak.js', 'js/write.js', 'js/quiz.js', 'js/toolkit.js', 'js/progress.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (new URL(req.url).pathname.includes('/content/audio/')) return; // аудіо (Range-запити) віддаємо браузеру напряму
  const isContent = new URL(req.url).pathname.includes('/content/');
  if (isContent) {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return r; }).catch(() => caches.match(req)));
    return;
  }
  // оболонка: спершу мережа для JS/CSS/HTML (щоб оновлення доходили), кеш — запасний
  e.respondWith(fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; }).catch(() => caches.match(req)));
});
