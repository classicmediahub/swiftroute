const webpush = require("web-push");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("./db");

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_CONTACT_EMAIL = process.env.VAPID_CONTACT_EMAIL || "mailto:support@pickandearn.com.ng";

// Generate a pair once with `npx web-push generate-vapid-keys` and put
// them in your .env (both locally and on Render) — they identify your
// server to push services (FCM/Mozilla/etc.) and never change afterward.
// Re-generating them would invalidate every subscription anyone has ever
// granted, forcing a full re-subscribe across every device.
const vapidConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (vapidConfigured) {
  webpush.setVapidDetails(VAPID_CONTACT_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — push notifications are disabled");
}

// Saves (or refreshes) a subscription. ON CONFLICT on endpoint alone —
// the browser's own subscription object is the identity here, not a
// (user_id, endpoint) pair, since a re-subscribe after clearing site data
// should just take over that endpoint rather than erroring.
async function saveSubscription(userId, subscription) {
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    throw new Error("Invalid push subscription");
  }
  const id = uuidv4();
  await pool.query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [id, userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
  );
}

async function removeSubscription(endpoint) {
  await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
}

// Sends to every device a user has subscribed on. Fire-and-forget by
// design, matching sendEmail/sendSMS in notifications.js — a push
// provider being slow or down must never block or fail the actual
// delivery/ride action that triggered the notification.
// `payload` is whatever shape the service worker's push handler expects:
// { title, body, url, tag }.
async function sendPushToUser(userId, payload) {
  if (!vapidConfigured) return;
  try {
    const { rows } = await pool.query("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1", [userId]);
    if (!rows.length) return;

    const body = JSON.stringify(payload);
    await Promise.allSettled(
      rows.map(async (sub) => {
        const pushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
        try {
          await webpush.sendNotification(pushSubscription, body);
        } catch (err) {
          // 404/410 means the browser has permanently invalidated this
          // endpoint (uninstalled, cleared data, unsubscribed elsewhere)
          // — clean it up so we stop wasting sends on it. Any other error
          // (network blip, provider hiccup) is just logged and left alone,
          // since it might succeed again next time.
          if (err.statusCode === 404 || err.statusCode === 410) {
            await removeSubscription(sub.endpoint).catch(() => {});
          } else {
            console.error("Push send failed:", err.statusCode, err.message);
          }
        }
      })
    );
  } catch (err) {
    console.error("sendPushToUser failed:", err.message);
  }
}

module.exports = { saveSubscription, removeSubscription, sendPushToUser, VAPID_PUBLIC_KEY };
