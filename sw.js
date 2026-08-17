// Minimal service worker.
// Its only real job is to exist and handle fetch: Chrome/Android require an
// active, fetch-handling service worker as part of PWA installability
// criteria. Without it, "Add to Home Screen" does not produce a real
// installed app, and the manifest's share_target is never registered with
// the OS share sheet (this is what caused issue #8: shares were falling
// back to a generic browser share page instead of opening PanierRecette).
//
// This is intentionally network-only (no offline caching) to avoid
// introducing stale-content bugs. It can be upgraded to a cache-first or
// stale-while-revalidate strategy later if offline support is wanted.

const SW_VERSION = 'v1';

self.addEventListener('install', (event) => {
  // Activate the new service worker as soon as it finishes installing.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of any open clients immediately.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through network fetch. Required so Chrome recognizes this as a
  // "fetch-handling" service worker for installability purposes.
  event.respondWith(fetch(event.request));
});
