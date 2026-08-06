const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const { pool } = require("./db");
const { getQuote } = require("./quote");
const { estimatedDeliveryAt } = require("./eta");
const { trackingCode } = require("./pricing");
const { initializeTransaction } = require("./paystack");
const { recordStreakActivity } = require("./streaks");
const { getAgentReputation } = require("./reputation");

const FRONTEND_URL = process.env.FRONTEND_URL || "https://www.pickandearn.com.ng";

// ---------- WHATSAPP ORDERING BOT — lets someone book a delivery entirely
// inside a WhatsApp chat, no app install or prior signup required. A
// lightweight customer account is auto-created on first contact, matched
// to their WhatsApp number (see findOrCreateUserByPhone). Conversation
// progress lives in whatsapp_sessions (see db.js) — a simple state machine,
// one question per message, since long multi-field forms don't work well
// in a chat interface.
//
// KNOWN TRADEOFF: delivery creation here duplicates (rather than reuses)
// the INSERT logic in routes/deliveries.js's POST / handler, because that
// handler is tightly coupled to Express req/res and requireAuth — pulling
// it into a shared function was a larger refactor than this feature
// needed. If deliveries' required columns change later, both places need
// updating. Institution/landmark picking is deliberately NOT offered
// here for v1 (free-text address only) — keeps the chat flow short;
// campus ordering can be added as a menu option later without changing
// this file's shape.

function normalizeDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}
function last10(raw) {
  return normalizeDigits(raw).slice(-10);
}

function paymentReference() {
  return `PAE-WA-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

// Matches by the last 10 digits so it doesn't matter whether an existing
// app account stored their number as "0801 234 5678", "+2348012345678",
// or anything else typed at signup — only a WhatsApp-registered customer
// account is matched (role = 'customer'), never an agent's phone number.
async function findOrCreateUserByPhone(waPhoneRaw) {
  const target = last10(waPhoneRaw);
  if (!target) return null;

  const { rows } = await pool.query(
    `SELECT * FROM users WHERE role = 'customer' AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1 LIMIT 1`,
    [target]
  );
  if (rows[0]) return rows[0];

  const digits = normalizeDigits(waPhoneRaw);
  const fakeEmail = `wa-${digits}@pickandearn.ng`;
  const id = uuidv4();
  const hash = bcrypt.hashSync(uuidv4(), 10); // random password — this account is only ever accessed via WhatsApp, never logged into directly

  await pool.query(
    `INSERT INTO users (id, role, full_name, email, phone, password_hash, account_type)
     VALUES ($1, 'customer', 'WhatsApp Customer', $2, $3, $4, 'individual')
     ON CONFLICT (email) DO NOTHING`,
    [id, fakeEmail, `+${digits}`, hash]
  );
  const { rows: created } = await pool.query("SELECT * FROM users WHERE email = $1", [fakeEmail]);
  return created[0];
}

async function getSession(phone) {
  const { rows } = await pool.query("SELECT * FROM whatsapp_sessions WHERE phone = $1", [phone]);
  if (rows[0]) return { state: rows[0].state, data: rows[0].data || {} };
  return { state: "idle", data: {} };
}

async function saveSession(phone, state, data) {
  await pool.query(
    `INSERT INTO whatsapp_sessions (phone, state, data, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (phone) DO UPDATE SET state = $2, data = $3, updated_at = now()`,
    [phone, state, JSON.stringify(data)]
  );
}

async function resetSession(phone) {
  await saveSession(phone, "idle", {});
}

const MENU =
  "Hi! \uD83D\uDC4B Welcome to Pick N' Earn.\n\nWhat would you like to do?\n1\uFE0F\u20E3 Send a delivery\n2\uFE0F\u20E3 Track a delivery\n\n(Reply 1 or 2. Type CANCEL anytime to start over.)";

const VEHICLE_MAP = { "1": "any", "2": "bike", "3": "cab", "4": "self" };

// Mirrors frontend/src/pages/TrackPublic.jsx's STAGE_LABELS — kept as a
// separate copy here rather than a shared import, since this file has no
// access to frontend code, but should read identically to what the
// website shows for the same delivery.
const STATUS_LABELS = {
  pending: "Order placed \u2014 waiting to be assigned to an agent",
  accepted: "Agent assigned",
  picked_up: "Picked up",
  in_transit: "In transit",
  delivered: "Delivered \u2705",
};

async function handleIncomingMessage(waFromRaw, bodyRaw) {
  const phone = String(waFromRaw || "").replace(/^whatsapp:/, "");
  const body = String(bodyRaw || "").trim();
  const bodyLower = body.toLowerCase();

  if (!phone) return "Sorry, something went wrong reading your number. Please try again.";

  if (bodyLower === "cancel") {
    await resetSession(phone);
    return "Okay, cancelled. Send any message to start again. \uD83D\uDC4B";
  }

  const { state, data } = await getSession(phone);

  if (state === "idle") {
    await saveSession(phone, "awaiting_menu_choice", {});
    return MENU;
  }

  if (state === "awaiting_menu_choice") {
    if (body === "1") {
      await saveSession(phone, "awaiting_pickup_address", {});
      return "Great! Where should we pick up from? (e.g. 12 Allen Avenue)";
    }
    if (body === "2") {
      await saveSession(phone, "awaiting_tracking_code", {});
      return "What's your tracking code? (e.g. PAE-Y3BCKLH)";
    }
    return "Please reply 1 to send a delivery, or 2 to track one.";
  }

  if (state === "awaiting_tracking_code") {
    const code = body.toUpperCase();
    let delivery;
    try {
      const { rows } = await pool.query("SELECT * FROM deliveries WHERE tracking_code = $1", [code]);
      delivery = rows[0];
    } catch (err) {
      console.error("WhatsApp tracking lookup failed:", err.message);
      return "Sorry, something went wrong looking that up. Please try again in a moment.";
    }

    if (!delivery) {
      return `Couldn't find a delivery with tracking code ${code}. Double-check it and send again, or type CANCEL.`;
    }
    await resetSession(phone); // one-shot lookup — back to idle once it resolves

    if (delivery.status === "cancelled") {
      return `\uD83D\uDCE6 ${delivery.tracking_code}\n${delivery.package_type} \u00b7 ${delivery.pickup_city} \u2192 ${delivery.dropoff_city}\n\nThis delivery was cancelled.\n\nSend any message to do something else.`;
    }

    const statusLine = STATUS_LABELS[delivery.status] || delivery.status;
    let agentLine = "";
    if (delivery.agent_id && delivery.status !== "pending") {
      try {
        const rep = await getAgentReputation(delivery.agent_id);
        if (rep) agentLine = `\n\n\uD83D\uDEF5 ${rep.full_name} \u00b7 \u2605 ${rep.rating.toFixed(1)} \u00b7 ${rep.total_deliveries} deliveries`;
      } catch (err) {
        console.error("WhatsApp agent lookup failed:", err.message); // non-fatal — status still shows without this line
      }
    }

    return (
      `\uD83D\uDCE6 ${delivery.tracking_code}\n${delivery.package_type} \u00b7 ${delivery.pickup_city} \u2192 ${delivery.dropoff_city}\n\n` +
      `Status: ${statusLine}${agentLine}\n\n` +
      `Live map: ${FRONTEND_URL}/track?code=${delivery.tracking_code}\n\nSend any message to do something else.`
    );
  }

  if (state === "awaiting_pickup_address") {
    data.pickup_address = body;
    await saveSession(phone, "awaiting_pickup_city", data);
    return "Which city is that in? (e.g. Lagos, Ota, Ogun)";
  }

  if (state === "awaiting_pickup_city") {
    data.pickup_city = body;
    await saveSession(phone, "awaiting_dropoff_address", data);
    return "Got it. Where should we deliver to?";
  }

  if (state === "awaiting_dropoff_address") {
    data.dropoff_address = body;
    await saveSession(phone, "awaiting_dropoff_city", data);
    return "Which city is that in?";
  }

  if (state === "awaiting_dropoff_city") {
    data.dropoff_city = body;
    await saveSession(phone, "awaiting_recipient_name", data);
    return "Who's receiving the package? (recipient's full name)";
  }

  if (state === "awaiting_recipient_name") {
    data.recipient_name = body;
    await saveSession(phone, "awaiting_recipient_phone", data);
    return "And their phone number?";
  }

  if (state === "awaiting_recipient_phone") {
    data.recipient_phone = body;
    await saveSession(phone, "awaiting_vehicle", data);
    return "Preferred ride?\n1\uFE0F\u20E3 Any\n2\uFE0F\u20E3 Bike\n3\uFE0F\u20E3 Cab\n4\uFE0F\u20E3 Self (walking agent)";
  }

  if (state === "awaiting_vehicle") {
    const vehicle = VEHICLE_MAP[body];
    if (!vehicle) return "Please reply 1, 2, 3, or 4.";
    data.preferred_vehicle = vehicle;

    let quote;
    try {
      quote = await getQuote({
        pickup_address: data.pickup_address, pickup_city: data.pickup_city,
        dropoff_address: data.dropoff_address, dropoff_city: data.dropoff_city,
        vehicle_type: vehicle,
      });
    } catch (err) {
      console.error("WhatsApp quote failed:", err.message);
      await resetSession(phone);
      return "Sorry, something went wrong getting your price. Please try again by sending any message.";
    }
    data.price = quote.price;
    data.distanceKm = quote.distanceKm;
    data.origin = quote.origin;
    data.destination = quote.destination;

    await saveSession(phone, "awaiting_confirmation", data);
    const distancePart = quote.distanceKm ? ` \u00b7 ${quote.distanceKm} km` : "";
    return (
      `Here's your estimate:\n\n\uD83D\uDCE6 \u20A6${quote.price.toLocaleString()}${distancePart}\n\n` +
      `From: ${data.pickup_address}, ${data.pickup_city}\nTo: ${data.dropoff_address}, ${data.dropoff_city}\n\n` +
      `Reply YES to confirm and get your payment link, or CANCEL to start over.`
    );
  }

  if (state === "awaiting_confirmation") {
    if (bodyLower !== "yes") return "Reply YES to confirm, or CANCEL to start over.";

    try {
      const user = await findOrCreateUserByPhone(phone);
      if (!user) throw new Error("Could not resolve a user for this phone number");

      const id = uuidv4();
      const code = trackingCode();
      const reference = paymentReference();
      const estAt = estimatedDeliveryAt({ distanceKm: data.distanceKm, vehicle_type: data.preferred_vehicle });

      await pool.query(
        `INSERT INTO deliveries (
          id, customer_id, package_type, package_note,
          pickup_address, pickup_city, dropoff_address, dropoff_city,
          recipient_name, recipient_phone, preferred_vehicle, price, tracking_code, distance_km,
          pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
          estimated_delivery_at, payment_status, paystack_reference, payment_method
        ) VALUES ($1,$2,'Package',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'unpaid',$19,'paystack')`,
        [
          id, user.id, "Sent via WhatsApp",
          data.pickup_address, data.pickup_city, data.dropoff_address, data.dropoff_city,
          data.recipient_name, data.recipient_phone, data.preferred_vehicle, data.price, code, data.distanceKm,
          data.origin?.lat ?? null, data.origin?.lng ?? null, data.destination?.lat ?? null, data.destination?.lng ?? null,
          estAt, reference,
        ]
      );
      await pool.query(
        `INSERT INTO delivery_events (id, delivery_id, status, note) VALUES ($1, $2, 'pending', 'Delivery request created via WhatsApp — awaiting payment')`,
        [uuidv4(), id]
      );
      await recordStreakActivity(user.id);

      const tx = await initializeTransaction({
        email: user.email,
        amountNaira: data.price,
        reference,
        callback_url: `${FRONTEND_URL}/payment/callback`,
        metadata: { delivery_id: id, source: "whatsapp" },
      });

      await resetSession(phone);
      return (
        `You're set! \uD83C\uDF89\n\nTracking code: ${code}\n\n` +
        `Complete payment here to confirm your delivery:\n${tx.authorization_url}\n\n` +
        `Once paid, we'll match you with a verified agent right away.`
      );
    } catch (err) {
      console.error("WhatsApp delivery creation failed:", err.message);
      await resetSession(phone);
      return "Sorry, something went wrong creating your delivery. Please try again by sending any message.";
    }
  }

  // Unknown/corrupted state — reset rather than get stuck
  await resetSession(phone);
  return MENU;
}

module.exports = { handleIncomingMessage };
