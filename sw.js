/* Brahaspati service worker: lets the installed app open offline.
   Network first (so visitors always get the latest version), falling back to the copy saved
   from the last visit. Only same-site files and the pinned CDN libraries are saved. */
var CACHE = 'brahaspati-v1';
var SHELL = ['./', 'index.html', 'apps.json', 'manifest.webmanifest', 'assets/style.css', 'assets/core.js', 'assets/ai.js',
  'assets/icons/icon-192.png', 'ai/'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function cacheable(url) {
  if (url.origin === self.location.origin) return true;
  // Pinned library versions never change, so they are safe to keep (AI model files are excluded: too big).
  return url.hostname === 'cdn.jsdelivr.net' && /@\d/.test(url.pathname);
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (!cacheable(url)) return; // let the browser handle everything else (AI APIs, PageSpeed, etc.)
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (req.mode === 'navigate' ? caches.match('./') : Response.error());
    });
  }));
});
