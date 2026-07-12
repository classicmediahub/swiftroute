const { pool } = require("./db");
const { sendEmail, sendSMS } = require("./notifications");

const MESSAGES = {
  payment_confirmed: {
    subject: (d) => `Payment received — ${d.tracking_code}`,
    sms: (d) => `SwiftRoute: Payment received for ${d.tracking_code}. We're finding you an agent now.`,
    html: (d) => `<p>We've received payment for your delivery <strong>${d.tracking_code}</strong> (${d.pickup_city} → ${d.dropoff_city}). We're matching you with a nearby agent now.</p>`,
  },
  accepted: {
    subject: (d) => `Agent assigned — ${d.tracking_code}`,
    sms: (d) => `SwiftRoute: An agent has been assigned to ${d.tracking_code} and is heading to pickup.`,
    html: (d) => `<p>Good news — an agent has accepted your delivery <strong>${d.tracking_code}</strong> and is on the way to pickup.</p>`,
  },
  picked_up: {
    subject: (d) => `Picked up — ${d.tracking_code}`,
    sms: (d) => `SwiftRoute: Your package for ${d.tracking_code} has been picked up and is on its way.`,
    html: (d) => `<p>Your package for <strong>${d.tracking_code}</strong> has been picked up and is on its way to ${d.dropoff_city}.</p>`,
  },
  in_transit: {
    subject: (d) => `On the way — ${d.tracking_code}`,
    sms: (d) => `SwiftRoute: ${d.tracking_code} is in transit to ${d.dropoff_city}.`,
    html: (d) => `<p>Your delivery <strong>${d.tracking_code}</strong> is now in transit to ${d.dropoff_city}.</p>`,
  },
  delivered: {
    subject: (d) => `Delivered — ${d.tracking_code}`,
    sms: (d) => `SwiftRoute: ${d.tracking_code} has been delivered. Thanks for using SwiftRoute!`,
    html: (d) => `<p>Your delivery <strong>${d.tracking_code}</strong> has been delivered. Thanks for using SwiftRoute — we'd love it if you left a rating on your dashboard.</p>`,
  },
  cancelled: {
    subject: (d) => `Delivery cancelled — ${d.tracking_code}`,
    sms: (d) => `SwiftRoute: Your delivery ${d.tracking_code} has been cancelled.`,
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

module.exports = { notifyCustomer };
