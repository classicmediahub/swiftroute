const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const MAX_MESSAGE_LENGTH = 1000;

// Loads the trip and confirms the requesting user is actually a party to
// it (its customer or agent), or an admin looking in for support/dispute
// purposes. Centralized here so both the send and poll routes enforce the
// exact same rule — a chat is only ever visible to the two people on it
// (plus admins), never guessable by trip id alone.
async function loadAuthorizedTrip(tripType, tripId, user) {
  const table = tripType === "ride" ? "rides" : tripType === "gas" ? "gas_orders" : tripType === "food" ? "food_orders" : "deliveries";
  const { rows } = await pool.query(`SELECT id, customer_id, agent_id, status FROM ${table} WHERE id = $1`, [tripId]);
  const trip = rows[0];
  if (!trip) return { trip: null, allowed: false, senderRole: null };

  if (user.role === "admin") return { trip, allowed: true, senderRole: null };
  if (trip.customer_id === user.id) return { trip, allowed: true, senderRole: "customer" };
  if (trip.agent_id === user.id) return { trip, allowed: true, senderRole: "agent" };
  return { trip, allowed: false, senderRole: null };
}

function validTripType(tripType) {
  return tripType === "ride" || tripType === "delivery" || tripType === "gas" || tripType === "food";
}

// ---------- POLL MESSAGES ----------
// ?after=<ISO timestamp> returns only messages newer than that — the
// frontend polls this every few seconds (see useTripChat.js) and only
// needs the delta, not the whole thread, once it's already loaded once.
router.get("/:trip_type/:trip_id", requireAuth, async (req, res) => {
  try {
    const { trip_type, trip_id } = req.params;
    if (!validTripType(trip_type)) return res.status(400).json({ error: "Invalid trip type" });

    const { trip, allowed } = await loadAuthorizedTrip(trip_type, trip_id, req.user);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (!allowed) return res.status(403).json({ error: "You don't have access to this chat" });

    const { after } = req.query;
    const { rows } = await pool.query(
      after
        ? `SELECT * FROM trip_messages WHERE trip_type = $1 AND trip_id = $2 AND created_at > $3 ORDER BY created_at ASC`
        : `SELECT * FROM trip_messages WHERE trip_type = $1 AND trip_id = $2 ORDER BY created_at ASC LIMIT 200`,
      after ? [trip_type, trip_id, after] : [trip_type, trip_id]
    );
    res.json({ messages: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading messages" });
  }
});

// ---------- SEND A MESSAGE ----------
router.post("/:trip_type/:trip_id", requireAuth, async (req, res) => {
  try {
    const { trip_type, trip_id } = req.params;
    if (!validTripType(trip_type)) return res.status(400).json({ error: "Invalid trip type" });

    const body = String(req.body.body || "").trim();
    if (!body) return res.status(400).json({ error: "Message can't be empty" });
    if (body.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: "Message is too long" });

    const { trip, allowed, senderRole } = await loadAuthorizedTrip(trip_type, trip_id, req.user);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    // Admins can read for disputes but shouldn't be able to impersonate
    // a party in the actual conversation.
    if (!allowed || !senderRole) return res.status(403).json({ error: "You don't have access to this chat" });

    // No point chatting about a trip that's already cancelled — keeps the
    // feature scoped to "coordinating an active or recently-finished
    // trip", not a general-purpose DM system.
    if (["cancelled", "canceled"].includes(trip.status)) {
      return res.status(409).json({ error: "This trip has been cancelled — chat is no longer available" });
    }

    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO trip_messages (id, trip_type, trip_id, sender_id, sender_role, body)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, trip_type, trip_id, req.user.id, senderRole, body]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong sending your message" });
  }
});

// ---------- MARK THE OTHER PARTY'S MESSAGES READ ----------
router.patch("/:trip_type/:trip_id/read", requireAuth, async (req, res) => {
  try {
    const { trip_type, trip_id } = req.params;
    if (!validTripType(trip_type)) return res.status(400).json({ error: "Invalid trip type" });

    const { trip, allowed } = await loadAuthorizedTrip(trip_type, trip_id, req.user);
    if (!trip) return res.status(404).json({ error: "Trip not found" });
    if (!allowed) return res.status(403).json({ error: "You don't have access to this chat" });

    await pool.query(
      `UPDATE trip_messages SET read_at = now()
       WHERE trip_type = $1 AND trip_id = $2 AND sender_id != $3 AND read_at IS NULL`,
      [trip_type, trip_id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ---------- UNREAD COUNTS ACROSS ALL MY ACTIVE TRIPS ----------
// Powers a small badge (e.g. on the dashboard nav) without the frontend
// needing to open every trip's chat just to check for new messages.
router.get("/unread-count", requireAuth, async (req, res) => {
  try {
    if (req.user.role === "customer") {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM trip_messages m
         WHERE m.sender_id != $1 AND m.read_at IS NULL AND (
           (m.trip_type = 'ride' AND m.trip_id IN (SELECT id::text FROM rides WHERE customer_id = $1))
           OR (m.trip_type = 'delivery' AND m.trip_id IN (SELECT id::text FROM deliveries WHERE customer_id = $1))
           OR (m.trip_type = 'gas' AND m.trip_id IN (SELECT id::text FROM gas_orders WHERE customer_id = $1))
           OR (m.trip_type = 'food' AND m.trip_id IN (SELECT id::text FROM food_orders WHERE customer_id = $1))
         )`,
        [req.user.id]
      );
      return res.json({ count: rows[0].count });
    }
    if (req.user.role === "agent") {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM trip_messages m
         WHERE m.sender_id != $1 AND m.read_at IS NULL AND (
           (m.trip_type = 'ride' AND m.trip_id IN (SELECT id::text FROM rides WHERE agent_id = $1))
           OR (m.trip_type = 'delivery' AND m.trip_id IN (SELECT id::text FROM deliveries WHERE agent_id = $1))
           OR (m.trip_type = 'gas' AND m.trip_id IN (SELECT id::text FROM gas_orders WHERE agent_id = $1))
           OR (m.trip_type = 'food' AND m.trip_id IN (SELECT id::text FROM food_orders WHERE agent_id = $1))
         )`,
        [req.user.id]
      );
      return res.json({ count: rows[0].count });
    }
    res.json({ count: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

module.exports = router;
