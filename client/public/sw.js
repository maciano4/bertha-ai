// Bertha service worker: caches the app shell only (the HTML page, built JS/CSS and icons) so the
// app opens fast and can be installed. It never caches API calls, sign-in, uploads or anything
// cross-origin: those always go to the network.
const VERSION = "bertha-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const NEVER_CACHE = [/^\/api\//, /^\/objects\//, /^\/public-objects\//, /^\/@/, /^\/src\//, /^\/node_modules\//];

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some(pattern => pattern.test(url.pathname))) return;

  // Pages: always try the network first so new versions show up; fall back to the cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(VERSION).then(cache => cache.put("/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/").then(cached => cached || Response.error())),
    );
    return;
  }

  // Built assets have hashed names, so cache-first is safe. Icons and the manifest are tiny.
  if (/^\/assets\//.test(url.pathname) || /^\/icons\//.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(VERSION).then(cache => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});
