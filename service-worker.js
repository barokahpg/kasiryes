// service-worker.js
//
// This service worker enables offline support for the Kasir Warung POS
// application.  It caches core assets (HTML, CSS, JS and JSON data) during
// installation and serves them from the cache when offline.  It also
// listens for the 'fetch' event to implement a cache‑first strategy for
// same‑origin GET requests, falling back to the network if the resource
// isn't in the cache.  For other requests (e.g. POST requests to Google
// Apps Script), the service worker simply forwards the request without
// caching.

const CACHE_NAME = 'kasiryes-cache-v1';

// List of resources to precache on install.  These are the core files that
// make up the application shell.  If you add more static assets (images,
// fonts, additional scripts) they should be included here so that they are
// available offline.  Note that relative URLs are relative to the origin
// where the service worker is served (typically the root of the app).
const PRECACHE_URLS = [
  '.',
  './index.html',
  './script.js',
  './style.css',
  './database.json',
  './manifest.json'
];

// During the install phase, open the cache and add the precache URLs.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

// Remove old caches during activation if the cache name has changed.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Intercept fetch requests.  For GET requests to the same origin, respond
// with the cached version if available, otherwise fetch from the network
// and optionally store a copy in the cache.  For other requests (e.g. POST
// requests or cross‑origin requests), simply forward the request to the
// network without caching.
self.addEventListener('fetch', event => {
  const request = event.request;
  // Only handle GET requests for same‑origin resources
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) {
    return;
  }
  event.respondWith(
    caches.match(request).then(response => {
      if (response) {
        // Found in cache, return it
        return response;
      }
      // Not in cache, fetch from network
      return fetch(request).then(networkResponse => {
        // Optionally cache the fetched resource for future use
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(request, networkResponse.clone());
          return networkResponse;
        });
      }).catch(() => {
        // Network fetch failed (offline) and resource not in cache
        // Fallback: if the request is for HTML, return the offline shell (index.html)
        if (request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
        // Otherwise, return a generic response or nothing
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

// Listen for background sync events.  If you decide to implement background
// synchronisation of unsent data (e.g. queued transactions), you can
// handle those tasks here.  Currently this handler is a stub; the
// application triggers its own sync when the network returns by listening
// for the 'online' event in the main script.  You could extend this by
// registering sync events with tags such as 'sync-data' and performing
// queued tasks when the event fires.
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    // For example, you could read queued requests from IndexedDB and
    // send them to the server here.
    event.waitUntil(Promise.resolve());
  }
});