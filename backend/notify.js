const crypto = require("crypto");
const { pool } = require("./db");
const { sendEmail, sendSMS } = require("./notifications");
const { sendPushToUser } = require("./push");

// Where tapping a push notification should land the person — matches
// whatever your customer dashboard actually uses to deep-link into one
// delivery/ride's tracking view. Adjust the path here if that route is
// named differently in App.jsx's router.
function deliveryUrl(delivery) {
  return `/dashboard?delivery=${delivery.tracking_code}`;
}
function rideUrl(ride) {
  return `/dashboard?ride=${ride.id}`;
}

const MESSAGES = {
  payment_confirmed: {
    subject: (d) => `Payment received — ${d.tracking_code}`,
    sms: (d) => `PickAndEarn: Payment received for ${d.tracking_code}. We're finding you an agent now.`,
    html: (d) => `<p>We've received payment for your delivery <strong>${d.tracking_code}</strong> (${d.pickup_city} → ${d.dropoff_city}). We're matching you with a nearby agent now.</p>`,
    push: (d) => ({ title: "Payment received", body: `${d.tracking_code} — finding you an agent now.` }),
  },
  accepted: {
    subject: (d) => `Agent assigned — ${d.tracking_code}`,
    sms: (d) => `PickAndEarn: An agent has been assigned to ${d.tracking_code} and is heading to pickup.`,
    html: (d) => `<p>Good news — an agent has accepted your delivery <strong>${d.tracking_code}</strong> and is on the way to pickup.</p>`,
    push: (d) => ({ title: "Agent on the way", body: `${d.tracking_code} — heading to pickup now.` }),
  },
  picked_up: {
    subject: (d) => `Picked up — ${d.tracking_code}`,
    sms: (d) => `PickAndEarn: Your package for ${d.tracking_code} has been picked up and is on its way.`,
    html: (d) => `<p>Your package for <strong>${d.tracking_code}</strong> has been picked up and is on its way to ${d.dropoff_city}.</p>`,
    push: (d) => ({ title: "Picked up", body: `${d.tracking_code} is on its way to ${d.dropoff_city}.` }),
  },
  in_transit: {
    subject: (d) => `On the way — ${d.tracking_code}`,
    sms: (d) => `PickAndEarn: ${d.tracking_code} is in transit to ${d.dropoff_city}.`,
    html: (d) => `<p>Your delivery <strong>${d.tracking_code}</strong> is now in transit to ${d.dropoff_city}.</p>`,
    push: (d) => ({ title: "On the way", body: `${d.tracking_code} is in transit to ${d.dropoff_city}.` }),
  },
  at_locker: {
    subject: (d) => `Ready for pickup — ${d.tracking_code}`,
    sms: (d) => `PickAndEarn: ${d.tracking_code} is waiting for you at the locker. Check your dashboard for your pickup code.`,
    html: (d) => `<p>Your delivery <strong>${d.tracking_code}</strong> has been dropped at the locker. Grab your pickup code from your dashboard to collect it.</p>`,
    push: (d) => ({ title: "Ready for pickup", body: `${d.tracking_code} is waiting at the locker — get your code in the app.` }),
  },
  delivered: {
    subject: (d) => `Delivered — ${d.tracking_code}`,
    sms: (d) => `PickAndEarn: ${d.tracking_code} has been delivered. Thanks for using PickAndEarn!`,
    html: (d) => `<p>Your delivery <strong>${d.tracking_code}</strong> has been delivered. Thanks for using PickAndEarn — we'd love it if you left a rating on your dashboard.</p>`,
    push: (d) => ({ title: "Delivered", body: `${d.tracking_code} has arrived. Tap to leave a rating.` }),
  },
  cancelled: {
    subject: (d) => `Delivery cancelled — ${d.tracking_code}`,
    sms: (d) => `PickAndEarn: Your delivery ${d.tracking_code} has been cancelled.`,
    html: (d) => `<p>Your delivery <strong>${d.tracking_code}</strong> has been cancelled.</p>`,
    push: (d) => ({ title: "Delivery cancelled", body: `${d.tracking_code} has been cancelled.` }),
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

    const pushContent = template.push ? template.push(delivery) : null;

    await Promise.allSettled([
      sendEmail({ to: customer.email, subject: template.subject(delivery), html: template.html(delivery) }),
      sendSMS({ to: customer.phone, message: template.sms(delivery) }),
      pushContent
        ? sendPushToUser(delivery.customer_id, { ...pushContent, url: deliveryUrl(delivery), tag: `delivery-${delivery.id}` })
        : Promise.resolve(),
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

// ---------- RIDES — same fire-and-forget pattern as notifyCustomer above,
// separate template set since a ride has no tracking_code or city fields
// (it has pickup_address/dropoff_address instead). No ride equivalent of
// notifyWebhook — that's a merchant/API-integration feature for business
// delivery accounts, which doesn't apply to passenger rides. ----------
const RIDE_MESSAGES = {
  payment_confirmed: {
    subject: () => `Ride booked — payment received`,
    sms: (r) => `PickAndEarn: Payment received for your ride to ${r.dropoff_address}. Finding you a driver now.`,
    html: (r) => `<p>We've received payment for your ride from <strong>${r.pickup_address}</strong> to <strong>${r.dropoff_address}</strong>. We're finding you a nearby driver now.</p>`,
    push: (r) => ({ title: "Payment received", body: `Finding you a driver to ${r.dropoff_address}.` }),
  },
  accepted: {
    subject: () => `Driver on the way`,
    sms: () => `PickAndEarn: A driver has accepted your ride and is heading to your pickup point.`,
    html: (r, agent) => `<p>Good news — <strong>${agent?.full_name || "a driver"}</strong> has accepted your ride and is heading to <strong>${r.pickup_address}</strong>.</p>`,
    push: (r, agent) => ({ title: "Driver on the way", body: `${agent?.full_name || "Your driver"} is heading to ${r.pickup_address}.` }),
  },
  in_progress: {
    subject: () => `Trip started`,
    sms: (r) => `PickAndEarn: Your trip to ${r.dropoff_address} is now underway.`,
    html: (r) => `<p>Your trip to <strong>${r.dropoff_address}</strong> is now underway.</p>`,
    push: (r) => ({ title: "Trip started", body: `On your way to ${r.dropoff_address}.` }),
  },
  completed: {
    subject: () => `Trip completed`,
    sms: () => `PickAndEarn: Your trip is complete. Thanks for riding with PickAndEarn!`,
    html: () => `<p>Your trip is complete. Thanks for riding with PickAndEarn — we'd love it if you left a rating on your dashboard.</p>`,
    push: () => ({ title: "Trip completed", body: "Tap to leave a rating." }),
  },
  cancelled: {
    subject: () => `Ride cancelled`,
    sms: () => `PickAndEarn: Your ride has been cancelled.`,
    html: () => `<p>Your ride has been cancelled.</p>`,
    push: () => ({ title: "Ride cancelled", body: "Your ride has been cancelled." }),
  },
};

async function notifyRideCustomer(ride, event) {
  const template = RIDE_MESSAGES[event];
  if (!template) return;
  try {
    const { rows } = await pool.query("SELECT full_name, email, phone FROM users WHERE id = $1", [ride.customer_id]);
    const customer = rows[0];
    if (!customer) return;

    let agent = null;
    if (event === "accepted" && ride.agent_id) {
      const { rows: agentRows } = await pool.query("SELECT full_name FROM users WHERE id = $1", [ride.agent_id]);
      agent = agentRows[0] || null;
    }

    const pushContent = template.push ? template.push(ride, agent) : null;

    await Promise.allSettled([
      sendEmail({ to: customer.email, subject: template.subject(ride), html: template.html(ride, agent) }),
      sendSMS({ to: customer.phone, message: template.sms(ride, agent) }),
      pushContent
        ? sendPushToUser(ride.customer_id, { ...pushContent, url: rideUrl(ride), tag: `ride-${ride.id}` })
        : Promise.resolve(),
    ]);
  } catch (err) {
    console.error("notifyRideCustomer failed:", err.message);
  }
}

module.exports = { notifyCustomer, notifyBulkUpload, notifyWebhook, notifyRideCustomer };
