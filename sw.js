/* Offline-Speicher für die App und Auslieferung der Dateien aus IndexedDB */
const CACHE = 'handyvertraege-v1';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function getFile(id) {
  return new Promise((res, rej) => {
    const rq = indexedDB.open('handyvertraege', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('files');
    rq.onerror = () => rej(rq.error);
    rq.onsuccess = () => {
      const g = rq.result.transaction('files').objectStore('files').get(id);
      g.onsuccess = () => res(g.result);
      g.onerror = () => rej(g.error);
    };
  });
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const m = url.pathname.match(/\/_blob\/([0-9a-f]+)$/);
  if (m && url.origin === location.origin) {
    e.respondWith(getFile(m[1]).then(b => b
      ? new Response(b, { headers: { 'Content-Type': b.type || 'application/octet-stream' } })
      : new Response('Datei nicht gefunden', { status: 404 })));
    return;
  }
  if (e.request.method !== 'GET') return;
  // App-Dateien: erst Netz (für Updates), sonst Cache. Schriften: Cache zuerst.
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (isFont) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => {
      const c = n.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return n;
    })));
  } else if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(n => {
      const c = n.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return n;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
  }
});
