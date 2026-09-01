import { api } from "../api";

// Web Push wants the VAPID public key as a Uint8Array, not the base64url
// string the server hands back — this is the standard conversion.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window;
}

// Call after login (or from a "Turn on notifications" button) — asks for
// permission, subscribes with the browser's push service, and saves the
// subscription server-side. Safe to call again on an already-subscribed
// device; the backend's ON CONFLICT (endpoint) just refreshes the row.
export async function subscribeToPush(token) {
  if (!isPushSupported()) return { subscribed: false, reason: "not-supported" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { subscribed: false, reason: "denied" };

  const { publicKey } = await api.pushVapidPublicKey();
  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, // required by Chrome — every push must show a visible notification
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await api.pushSubscribe(token, subscription.toJSON());
  return { subscribed: true };
}

export async function unsubscribeFromPush(token) {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await subscription.unsubscribe();
  await api.pushUnsubscribe(token, subscription.endpoint);
}
