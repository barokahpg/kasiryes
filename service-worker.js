/*
 * Service Worker for KasirYes
 *
 * In addition to handling background sync events, this service worker
 * implements a basic offline caching strategy.  During installation
 * it pre‑caches all of the core application assets (HTML, CSS, JS,
 * manifest and icons).  During fetch events it attempts to serve
 * cached resources first and falls back to the network if necessary.
 * If both cache and network are unavailable, a simple fallback
 * response is returned.  This enables the POS application to load
 * and function even when the device is temporarily offline.
 */

// Define a versioned cache name so that future updates can cleanly
// invalidate old caches by changing this string.  If you update
// STATIC_ASSETS or make changes to cached files, bump the version.
const CACHE_NAME = 'kasiryes-cache-v1';

// List of resources to pre‑cache.  These are the assets required
// to load the application shell offline.  Paths are relative to
// the origin when served via localhost or another web server.
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

self.addEventListener('install', event => {
    // Pre‑cache the application shell during installation.  Once
    // caching is complete, immediately activate the service worker
    // without waiting for old versions to close.
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS);
        }).catch(err => {
            // If caching fails, still proceed with installation.
            console.warn('Service Worker: Failed to pre‑cache assets', err);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    // Delete any old caches that don't match the current CACHE_NAME.  This
    // prevents stale resources from persisting after upgrades.  Then
    // immediately take control of all clients.
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
        );
        await self.clients.claim();
    })());
});

// Intercept network requests and attempt to serve them from cache.
// If the resource is not in cache, fall back to the network.  If
// offline and the resource isn't cached, return a minimal fallback.
self.addEventListener('fetch', event => {
    // We only want to handle GET requests over HTTP(S).  Non‑GET
    // requests and requests to other protocols (such as chrome‑extension:)
    // should bypass the service worker.
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).catch(() => {
                // If both cache and network fail, fallback to the root page.
                return caches.match('/');
            });
        })
    );
});

self.addEventListener('sync', event => {
    if (event.tag === 'kasir-sync') {
        event.waitUntil(handleSyncEvent());
    }
});

/**
 * Handle a sync event by notifying all connected clients.  We avoid
 * performing fetches directly in the service worker to keep the logic
 * contained in the page, where IndexedDB and other stateful APIs are
 * already available.  If there are no clients, the message will be
 * dropped silently.
 */
async function handleSyncEvent() {
    try {
        const clientList = await self.clients.matchAll({ includeUncontrolled: true });
        for (const client of clientList) {
            client.postMessage({ type: 'sync' });
        }
    } catch (err) {
        // Ignore errors; background sync will retry automatically.
    }
}