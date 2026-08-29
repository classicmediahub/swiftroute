const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sendEmail, sendSMS } = require("../notifications");

const router = express.Router();

function mapsLink(lat, lng) {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

// Same "confirm the requester is actually a party to this trip" check as
// routes/messages.js's loadAuthorizedTrip — kept as its own small copy
// here rather than a shared import, since this one doesn't need the
// admin-can-read-but-not-send distinction messages.js has; SOS has no
// admin-triggers-an-alert case at all.
async function loadTripParticipant(tripType, tripId, user) {
  const table = tripType === "ride" ? "rides" : tripType === "gas" ? "gas_orders" : tripType === "food" ? "food_orders" : "deliveries";
  const { rows } = await pool.query(`SELECT id, customer_id, agent_id FROM ${table} WHERE id = $1`, [tripId]);
  const trip = rows[0];
  if (!trip) return { trip: null, role: null };
  if (trip.customer_id === user.id) return { trip, role: "customer" };
  if (trip.agent_id === user.id) return { trip, role: "agent" };
  return { trip, role: null };
}

// ---------- EMERGENCY CONTACT (any role) ----------
router.get("/emergency-contact", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT emergency_contact_name, emergency_contact_phone FROM users WHERE id = $1",
      [req.user.id]
    );
    res.json(rows[0] || { emergency_contact_name: null, emergency_contact_phone: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your emergency contact" });
  }
});

router.put("/emergency-contact", requireAuth, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    if (!name || !phone) return res.status(400).json({ error: "Both a name and phone number are required" });

    await pool.query(
      "UPDATE users SET emergency_contact_name = $1, emergency_contact_phone = $2 WHERE id = $3",
      [name, phone, req.user.id]
    );
    res.json({ emergency_contact_name: name, emergency_contact_phone: phone });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong saving your emergency contact" });
  }
});

// ---------- TRIGGER AN ALERT ----------
router.post("/", requireAuth, async (req, res) => {
  try {
    const { trip_type, trip_id, lat, lng } = req.body;
    if (trip_type !== "ride" && trip_type !== "delivery" && trip_type !== "gas" && trip_type !== "food") {
      return res.status(400).json({ error: "Invalid trip type" });
    }

    const { trip, role } = await loadTripParticipant(trip_type, trip_id, req.user);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (!role) return res.status(403).json({ error: "You're not a party to this trip" });

    // Don't let a panicked double-tap create five separate alert rows —
    // if there's already an active one for this exact person+trip,
    // treat a repeat press as "still active", not a new incident.
    const { rows: existing } = await pool.query(
      `SELECT * FROM sos_alerts WHERE user_id = $1 AND trip_type = $2 AND trip_id = $3 AND status = 'active'`,
      [req.user.id, trip_type, trip_id]
    );
    if (existing[0]) {
      return res.status(200).json({ ...existing[0], already_active: true });
    }

    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO sos_alerts (id, user_id, role, trip_type, trip_id, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, req.user.id, role, trip_type, trip_id, lat ?? null, lng ?? null]
    );
    const alert = rows[0];

    // Notifications happen AFTER the alert is already saved and the
    // triggering person already has a success response — a slow or
    // failing SMS/email provider should never delay telling them "this
    // was recorded," and Promise.allSettled means one channel failing
    // (e.g. no emergency contact saved) doesn't stop the other (admins
    // still get notified either way).
    notifyOfAlert(alert, req.user).catch((err) => console.error("SOS notification failed:", err.message));

    res.status(201).json(alert);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong triggering the alert. Please call for help directly if needed." });
  }
});

async function notifyOfAlert(alert, triggeringUser) {
  const { rows: userRows } = await pool.query(
    "SELECT full_name, phone, emergency_contact_name, emergency_contact_phone FROM users WHERE id = $1",
    [alert.user_id]
  );
  const user = userRows[0];
  if (!user) return;

  const link = mapsLink(alert.lat, alert.lng);
  const locationLine = link ? `Location: ${link}` : "Location: not available";
  const tripLabel = alert.trip_type === "ride" ? "ride" : alert.trip_type === "gas" ? "gas order" : alert.trip_type === "food" ? "food delivery" : "delivery";

  const tasks = [];

  if (user.emergency_contact_phone) {
    tasks.push(
      sendSMS({
        to: user.emergency_contact_phone,
        message: `PickAndEarn SOS: ${user.full_name} has triggered an emergency alert during a ${tripLabel}. ${locationLine}. If you can, please contact them now at ${user.phone}.`,
      })
    );
  }

  const { rows: admins } = await pool.query("SELECT full_name, email, phone FROM users WHERE role = 'admin'");
  for (const admin of admins) {
    tasks.push(
      sendSMS({
        to: admin.phone,
        message: `PickAndEarn SOS: ${user.full_name} (${triggeringUser.role}) triggered an alert on ${tripLabel} #${alert.trip_id.slice(0, 8)}. ${locationLine}. Check the admin dashboard.`,
      })
    );
    tasks.push(
      sendEmail({
        to: admin.email,
        subject: `🚨 SOS alert — ${user.full_name}`,
        html: `<p><strong>${user.full_name}</strong> (${triggeringUser.role}) triggered an emergency alert during a ${tripLabel} (#${alert.trip_id}).</p>
               <p>${link ? `<a href="${link}">View their location</a>` : "Location was not available."}</p>
               <p>Their phone: ${user.phone}</p>
               <p>Please check the admin dashboard's SOS Alerts tab immediately.</p>`,
      })
    );
  }

  await Promise.allSettled(tasks);
}

// ---------- MY ACTIVE ALERT FOR A TRIP (so the frontend can show "help is on the way" after a refresh) ----------
router.get("/:trip_type/:trip_id/mine", requireAuth, async (req, res) => {
  try {
    const { trip_type, trip_id } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM sos_alerts WHERE user_id = $1 AND trip_type = $2 AND trip_id = $3 AND status = 'active'`,
      [req.user.id, trip_type, trip_id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ================= ADMIN =================

router.get("/admin/active", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, u.full_name, u.phone, u.emergency_contact_name, u.emergency_contact_phone
       FROM sos_alerts a JOIN users u ON u.id = a.user_id
       WHERE a.status = 'active' ORDER BY a.created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading active alerts" });
  }
});

router.patch("/admin/:id/resolve", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE sos_alerts SET status = 'resolved', resolved_at = now(), resolved_by = $1
       WHERE id = $2 AND status = 'active' RETURNING *`,
      [req.user.id, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Alert not found or already resolved" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong resolving this alert" });
  }
});

module.exports = router;
