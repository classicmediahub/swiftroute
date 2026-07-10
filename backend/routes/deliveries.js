const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { estimatePrice, trackingCode } = require("../pricing");

const router = express.Router();

async function logEvent(deliveryId, status, note) {
  await pool.query(
    `INSERT INTO delivery_events (id, delivery_id, status, note) VALUES ($1, $2, $3, $4)`,
    [uuidv4(), deliveryId, status, note || null]
  );
}

// ---------- PRICE ESTIMATE ----------
router.post("/estimate", requireAuth, (req, res) => {
  const { pickup_city, dropoff_city, preferred_vehicle } = req.body;
  if (!pickup_city || !dropoff_city) {
    return res.status(400).json({ error: "pickup_city and dropoff_city are required" });
  }
  const price = estimatePrice({ pickup_city, dropoff_city, vehicle_type: preferred_vehicle || "any" });
  res.json({ price });
});

// ---------- CREATE DELIVERY (customer) ----------
router.post("/", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const {
      package_type, package_note,
      pickup_address, pickup_city,
      dropoff_address, dropoff_city,
      recipient_name, recipient_phone,
      preferred_vehicle
    } = req.body;

    if (!package_type || !pickup_address || !pickup_city || !dropoff_address || !dropoff_city || !recipient_name || !recipient_phone) {
      return res.status(400).json({ error: "Missing required delivery details" });
    }

    const vehicle = preferred_vehicle && ["self", "bike", "cab", "any"].includes(preferred_vehicle) ? preferred_vehicle : "any";
    const price = estimatePrice({ pickup_city, dropoff_city, vehicle_type: vehicle });
    const id = uuidv4();
    const code = trackingCode();

    await pool.query(
      `INSERT INTO deliveries (
        id, customer_id, package_type, package_note,
        pickup_address, pickup_city, dropoff_address, dropoff_city,
        recipient_name, recipient_phone, preferred_vehicle, price, tracking_code
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [id, req.user.id, package_type, package_note || null,
       pickup_address, pickup_city, dropoff_address, dropoff_city,
       recipient_name, recipient_phone, vehicle, price, code]
    );

    await logEvent(id, "pending", "Delivery request created");

    const { rows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong creating the delivery" });
  }
});

// ---------- LIST MY DELIVERIES (customer) ----------
router.get("/mine", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, u.full_name AS agent_name, u.phone AS agent_phone
       FROM deliveries d LEFT JOIN users u ON u.id = d.agent_id
       WHERE d.customer_id = $1 ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your deliveries" });
  }
});

// ---------- AVAILABLE DELIVERIES FOR AGENTS ----------
router.get("/available", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows: profileRows } = await pool.query("SELECT * FROM agent_profiles WHERE user_id = $1", [req.user.id]);
    const profile = profileRows[0];
    if (!profile) return res.status(400).json({ error: "Agent profile not found" });
    if (profile.approval_status !== "approved") {
      return res.status(403).json({ error: "Your agent account is pending admin approval" });
    }

    const { rows } = await pool.query(
      `SELECT d.*, u.full_name AS customer_name, u.phone AS customer_phone
       FROM deliveries d JOIN users u ON u.id = d.customer_id
       WHERE d.status = 'pending'
         AND (d.preferred_vehicle = 'any' OR d.preferred_vehicle = $1)
       ORDER BY d.created_at ASC`,
      [profile.vehicle_type]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading available deliveries" });
  }
});

// ---------- MY ASSIGNED DELIVERIES (agent) ----------
router.get("/assigned", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, u.full_name AS customer_name, u.phone AS customer_phone
       FROM deliveries d JOIN users u ON u.id = d.customer_id
       WHERE d.agent_id = $1 ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your deliveries" });
  }
});

// ---------- ACCEPT DELIVERY (agent) ----------
router.post("/:id/accept", requireAuth, requireRole("agent"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows: profileRows } = await client.query("SELECT * FROM agent_profiles WHERE user_id = $1", [req.user.id]);
    const profile = profileRows[0];
    if (!profile || profile.approval_status !== "approved") {
      return res.status(403).json({ error: "Your agent account is pending admin approval" });
    }

    await client.query("BEGIN");
    // Lock the row so two agents can't accept the same job at once.
    const { rows: deliveryRows } = await client.query("SELECT * FROM deliveries WHERE id = $1 FOR UPDATE", [req.params.id]);
    const delivery = deliveryRows[0];
    if (!delivery) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Delivery not found" });
    }
    if (delivery.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This delivery has already been accepted by another agent" });
    }

    await client.query(
      `UPDATE deliveries SET status = 'accepted', agent_id = $1, accepted_at = now() WHERE id = $2`,
      [req.user.id, delivery.id]
    );
    await client.query("COMMIT");

    await logEvent(delivery.id, "accepted", `Accepted by agent ${req.user.full_name}`);

    const { rows: updatedRows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [delivery.id]);
    res.json(updatedRows[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Something went wrong accepting this delivery" });
  } finally {
    client.release();
  }
});

// ---------- UPDATE STATUS (agent, own delivery only) ----------
const NEXT_STATUS = {
  accepted: "picked_up",
  picked_up: "in_transit",
  in_transit: "delivered",
};

router.patch("/:id/advance", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [req.params.id]);
    const delivery = rows[0];
    if (!delivery) return res.status(404).json({ error: "Delivery not found" });
    if (delivery.agent_id !== req.user.id) return res.status(403).json({ error: "Not your delivery" });

    const next = NEXT_STATUS[delivery.status];
    if (!next) return res.status(409).json({ error: `Cannot advance a delivery from status '${delivery.status}'` });

    const timestampCol = next === "picked_up" ? "picked_up_at" : next === "delivered" ? "delivered_at" : null;
    if (timestampCol) {
      await pool.query(`UPDATE deliveries SET status = $1, ${timestampCol} = now() WHERE id = $2`, [next, delivery.id]);
    } else {
      await pool.query(`UPDATE deliveries SET status = $1 WHERE id = $2`, [next, delivery.id]);
    }

    if (next === "delivered") {
      await pool.query(
        `UPDATE agent_profiles SET total_deliveries = total_deliveries + 1, wallet_balance = wallet_balance + $1 WHERE user_id = $2`,
        [delivery.price * 0.8, req.user.id]
      );
    }

    await logEvent(delivery.id, next);
    const { rows: updatedRows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [delivery.id]);
    res.json(updatedRows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating this delivery" });
  }
});

// ---------- CANCEL (customer, only if still pending/accepted) ----------
router.patch("/:id/cancel", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [req.params.id]);
    const delivery = rows[0];
    if (!delivery) return res.status(404).json({ error: "Delivery not found" });
    if (delivery.customer_id !== req.user.id) return res.status(403).json({ error: "Not your delivery" });
    if (!["pending", "accepted"].includes(delivery.status)) {
      return res.status(409).json({ error: "This delivery can no longer be cancelled" });
    }
    await pool.query(`UPDATE deliveries SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [delivery.id]);
    await logEvent(delivery.id, "cancelled", "Cancelled by customer");
    const { rows: updatedRows } = await pool.query("SELECT * FROM deliveries WHERE id = $1", [delivery.id]);
    res.json(updatedRows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong cancelling this delivery" });
  }
});

// ---------- TRACK BY CODE ----------
router.get("/track/:code", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM deliveries WHERE tracking_code = $1", [req.params.code.toUpperCase()]);
    const delivery = rows[0];
    if (!delivery) return res.status(404).json({ error: "No delivery found with that tracking code" });
    const { rows: events } = await pool.query(
      "SELECT * FROM delivery_events WHERE delivery_id = $1 ORDER BY created_at ASC",
      [delivery.id]
    );
    res.json({ delivery, events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong looking up this delivery" });
  }
});

module.exports = router;
