// Deliberately does nothing beyond existing. Chrome (and other browsers)
// require an active service worker with a fetch handler before they'll
// fire beforeinstallprompt at all — this is that minimum bar, nothing
// more. It does NOT cache anything.
//
// Why no caching: this app deploys multiple times a day and serves live,
// frequently-changing data (wallet balances, order status, chat, prices).
// A caching layer here risks someone getting stuck on a stale JS bundle
// after a deploy, or seeing outdated data that looks live but isn't —
// exactly the failure mode a fast-moving app can't afford. If real
// offline support is ever wanted later, build it deliberately and
// test the update/versioning story properly rather than bolting it on
// here as a side effect of installability.

self.addEventListener("install", () => {
  self.skipWaiting(); // don't make users close every tab to get a new version
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request)); // pure pass-through, no cache involved
});
