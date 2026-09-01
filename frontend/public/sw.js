// Minimum viable service worker: installability (via the fetch handler
// below) plus Web Push support. Deliberately does NOT cache anything.
//
// Why no caching: this app deploys multiple times a day and serves live,
// frequently-changing data (wallet balances, order status, chat, prices).
// A caching layer here risks someone getting stuck on a stale JS bundle
// after a deploy, or seeing outdated data that looks live but isn't —
// exactly the failure mode a fast-moving app can't afford. If full offline
// page support is ever wanted later, build it deliberately and test the
// update/versioning story properly rather than bolting it on here as a
// side effect of installability.
//
// Offline *action* queueing (agent status updates) intentionally lives in
// the main thread instead of here — see frontend/src/lib/offlineQueue.js
// — so it works the same on Safari/iOS, which doesn't support Background
// Sync, without needing to pass auth tokens into this worker's context.

self.addEventListener("install", () => {
  self.skipWaiting(); // don't make users close every tab to get a new version
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request)); // pure pass-through, no cache involved
});

// ---------- WEB PUSH ----------
// The payload is whatever push.js's sendPushToUser sent: { title, body,
// url, tag }. `tag` collapses multiple notifications for the same
// delivery/ride into one (a customer doesn't need 4 separate banners for
// one trip's lifecycle) — a new one with the same tag replaces the old
// rather than stacking.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "PickAndEarn", body: event.data.text() };
  }

  const { title = "PickAndEarn", body = "", url = "/", tag } = payload;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url },
    })
  );
});

// Focuses an already-open tab on the right page if one exists, otherwise
// opens a new one — the standard pattern for "tap a notification, land
// in the app" rather than always spawning a fresh tab.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
      }
      if (clients.length > 0 && "focus" in clients[0]) {
        clients[0].navigate(targetUrl);
        return clients[0].focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
