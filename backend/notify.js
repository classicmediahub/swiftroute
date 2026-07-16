const crypto = require("crypto");
const { pool } = require("./db");
const { sendEmail, sendSMS } = require("./notifications");

const MESSAGES = {
  payment_confirmed: {
    subject: (d) => `Payment received — ${d.tracking_code}`,
    sms: (d) => `PickAndEarn: Payment received for ${d.tracking_code}. We're finding you an agent now.`,
    html: (d) => `<p>We've received payment for your delivery <strong>${d.tracking_code}</strong> (${d.pickup_city} → ${d.dropoff_city}). We're matching you with a nearby agent now.</p>`,
  },
  accepted: {
    subject: (d) => `Agent assigned — ${d.tracking_code}`,
    sms: (d) => `PickAndEarn: An agent has been assigned to ${d.tracking_code} and is heading to pickup.`,
    html: (d) => `<p>Good news — an agent has accepted your delivery <strong>${d.tracking_code}</strong> and is on the way to pickup.</p>`,
  },
  picked_up: {
    subject: (d) => `Picked up — ${d.tracking_code}`,
    sms: (d) => `PickAndEarn: Your package for ${d.tracking_code} has been picked up and is on its way.`,
    html: (d) => `<p>Your package for <strong>${d.tracking_code}</strong> has been picked up and is on its way to ${d.dropoff_city}.</p>`,
  },
  in_transit: {
    subject: (d) => `On the way — ${d.tracking_code}`,
    sms: (d) => `PickAndEarn: ${d.tracking_code} is in transit to ${d.dropoff_city}.`,
    html: (d) => `<p>Your delivery <strong>${d.tracking_code}</strong> is now in transit to ${d.dropoff_city}.</p>`,
  },
  delivered: {
    subject: (d) => `Delivered — ${d.tracking_code}`,
    sms: (d) => `PickAndEarn: ${d.tracking_code} has been delivered. Thanks for using PickAndEarn!`,
    html: (d) => `<p>Your delivery <strong>${d.tracking_code}</strong> has been delivered. Thanks for using PickAndEarn — we'd love it if you left a rating on your dashboard.</p>`,
  },
  cancelled: {
    subject: (d) => `Delivery cancelled — ${d.tracking_code}`,
    sms: (d) => `PickAndEarn: Your delivery ${d.tracking_code} has been cancelled.`,
    html: (d) => `<p>Your delivery <strong>${d.tracking_code}</strong> has been cancelled.</p>`,
  },
};

// Fire-and-forget by design: the caller doesn't await this, so a slow or
// failing email/SMS provider never delays or breaks the actual delivery
// action (payment, accept, status update). Failures are logged, not thrown.
async function notifyCustomer(delivery, event) {
  const template = MESSAGES[event];
  if (!template) return;
  try {
    const { rows } = await pool.query("SELECT full_name, email, phone FROM users WHERE id = $1", [delivery.customer_id]);
    const customer = rows[0];
    if (!customer) return;

    await Promise.allSettled([
      sendEmail({ to: customer.email, subject: template.subject(delivery), html: template.html(delivery) }),
      sendSMS({ to: customer.phone, message: template.sms(delivery) }),
    ]);
  } catch (err) {
    console.error("notifyCustomer failed:", err.message);
  }
}

// One notification for an entire bulk upload, rather than one per delivery.
async function notifyBulkUpload(user, count, totalPrice) {
  try {
    await Promise.allSettled([
      sendEmail({
        to: user.email,
        subject: `${count} deliveries created — ₦${totalPrice.toLocaleString()} charged`,
        html: `<p>Your bulk upload of <strong>${count} deliveries</strong> was created and paid from your wallet (₦${totalPrice.toLocaleString()} total). You can see them all on your dashboard.</p>`,
      }),
      sendSMS({
        to: user.phone,
        message: `PickAndEarn: ${count} deliveries created, ₦${totalPrice.toLocaleString()} charged from your wallet.`,
      }),
    ]);
  } catch (err) {
    console.error("notifyBulkUpload failed:", err.message);
  }
}

// Sends a signed webhook to a merchant's own system when a delivery they
// created (via the dashboard or the public API) changes status — this is
// what lets a connected online store auto-update its own order status.
// Fails silently (logged, not thrown) so a broken webhook endpoint on the
// merchant's side never affects the delivery itself.
async function notifyWebhook(delivery, event) {
  try {
    const { rows } = await pool.query("SELECT webhook_url, webhook_secret FROM users WHERE id = $1", [delivery.customer_id]);
    const merchant = rows[0];
    if (!merchant || !merchant.webhook_url) return;

    const payload = JSON.stringify({
      event: `delivery.${event}`,
      data: {
        tracking_code: delivery.tracking_code,
        status: delivery.status,
        payment_status: delivery.payment_status,
        price: delivery.price,
        distance_km: delivery.distance_km,
        pickup_city: delivery.pickup_city,
        dropoff_city: delivery.dropoff_city,
        recipient_name: delivery.recipient_name,
      },
      timestamp: new Date().toISOString(),
    });

    const signature = crypto.createHmac("sha256", merchant.webhook_secret).update(payload).digest("hex");

    await fetch(merchant.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PickAndEarn-Signature": signature,
      },
      body: payload,
    }).catch((err) => console.error("Webhook delivery failed:", err.message));
  } catch (err) {
    console.error("notifyWebhook failed:", err.message);
  }
}

module.exports = { notifyCustomer, notifyBulkUpload, notifyWebhook };
