const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { estimatePrice, trackingCode } = require("../pricing");

const router = express.Router();

function logEvent(deliveryId, status, note) {
  db.prepare(
    `INSERT INTO delivery_events (id, delivery_id, status, note) VALUES (?, ?, ?, ?)`
  ).run(uuidv4(), deliveryId, status, note || null);
}

// ---------- PRICE ESTIMATE (public-ish, requires auth to keep it simple) ----------
router.post("/estimate", requireAuth, (req, res) => {
  const { pickup_city, dropoff_city, preferred_vehicle } = req.body;
  if (!pickup_city || !dropoff_city) {
    return res.status(400).json({ error: "pickup_city and dropoff_city are required" });
  }
  const price = estimatePrice({ pickup_city, dropoff_city, vehicle_type: preferred_vehicle || "any" });
  res.json({ price });
});

// ---------- CREATE DELIVERY (customer) ----------
router.post("/", requireAuth, requireRole("customer"), (req, res) => {
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

  db.prepare(`
    INSERT INTO deliveries (
      id, customer_id, package_type, package_note,
      pickup_address, pickup_city, dropoff_address, dropoff_city,
      recipient_name, recipient_phone, preferred_vehicle, price, tracking_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.user.id, package_type, package_note || null,
    pickup_address, pickup_city, dropoff_address, dropoff_city,
    recipient_name, recipient_phone, vehicle, price, code
  );

  logEvent(id, "pending", "Delivery request created");

  const delivery = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(id);
  res.status(201).json(delivery);
});

// ---------- LIST MY DELIVERIES (customer) ----------
router.get("/mine", requireAuth, requireRole("customer"), (req, res) => {
  const rows = db.prepare(
    `SELECT d.*, u.full_name AS agent_name, u.phone AS agent_phone
     FROM deliveries d LEFT JOIN users u ON u.id = d.agent_id
     WHERE d.customer_id = ? ORDER BY d.created_at DESC`
  ).all(req.user.id);
  res.json(rows);
});

// ---------- AVAILABLE DELIVERIES FOR AGENTS (pending, matching vehicle) ----------
router.get("/available", requireAuth, requireRole("agent"), (req, res) => {
  const profile = db.prepare("SELECT * FROM agent_profiles WHERE user_id = ?").get(req.user.id);
  if (!profile) return res.status(400).json({ error: "Agent profile not found" });
  if (profile.approval_status !== "approved") {
    return res.status(403).json({ error: "Your agent account is pending admin approval" });
  }

  const rows = db.prepare(`
    SELECT d.*, u.full_name AS customer_name, u.phone AS customer_phone
    FROM deliveries d JOIN users u ON u.id = d.customer_id
    WHERE d.status = 'pending'
      AND (d.preferred_vehicle = 'any' OR d.preferred_vehicle = ?)
    ORDER BY d.created_at ASC
  `).all(profile.vehicle_type);

  res.json(rows);
});

// ---------- MY ASSIGNED DELIVERIES (agent) ----------
router.get("/assigned", requireAuth, requireRole("agent"), (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, u.full_name AS customer_name, u.phone AS customer_phone
    FROM deliveries d JOIN users u ON u.id = d.customer_id
    WHERE d.agent_id = ? ORDER BY d.created_at DESC
  `).all(req.user.id);
  res.json(rows);
});

// ---------- ACCEPT DELIVERY (agent) ----------
router.post("/:id/accept", requireAuth, requireRole("agent"), (req, res) => {
  const profile = db.prepare("SELECT * FROM agent_profiles WHERE user_id = ?").get(req.user.id);
  if (!profile || profile.approval_status !== "approved") {
    return res.status(403).json({ error: "Your agent account is pending admin approval" });
  }
  const delivery = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(req.params.id);
  if (!delivery) return res.status(404).json({ error: "Delivery not found" });
  if (delivery.status !== "pending") {
    return res.status(409).json({ error: "This delivery has already been accepted by another agent" });
  }

  db.prepare(
    `UPDATE deliveries SET status = 'accepted', agent_id = ?, accepted_at = datetime('now') WHERE id = ?`
  ).run(req.user.id, delivery.id);
  logEvent(delivery.id, "accepted", `Accepted by agent ${req.user.full_name}`);

  const updated = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(delivery.id);
  res.json(updated);
});

// ---------- UPDATE STATUS (agent, own delivery only) ----------
const NEXT_STATUS = {
  accepted: "picked_up",
  picked_up: "in_transit",
  in_transit: "delivered",
};

router.patch("/:id/advance", requireAuth, requireRole("agent"), (req, res) => {
  const delivery = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(req.params.id);
  if (!delivery) return res.status(404).json({ error: "Delivery not found" });
  if (delivery.agent_id !== req.user.id) return res.status(403).json({ error: "Not your delivery" });

  const next = NEXT_STATUS[delivery.status];
  if (!next) return res.status(409).json({ error: `Cannot advance a delivery from status '${delivery.status}'` });

  const timestampCol = next === "picked_up" ? "picked_up_at" : next === "delivered" ? "delivered_at" : null;
  if (timestampCol) {
    db.prepare(`UPDATE deliveries SET status = ?, ${timestampCol} = datetime('now') WHERE id = ?`).run(next, delivery.id);
  } else {
    db.prepare(`UPDATE deliveries SET status = ? WHERE id = ?`).run(next, delivery.id);
  }

  if (next === "delivered") {
    db.prepare(
      `UPDATE agent_profiles SET total_deliveries = total_deliveries + 1, wallet_balance = wallet_balance + ? WHERE user_id = ?`
    ).run(delivery.price * 0.8, req.user.id); // agent keeps 80%, platform 20%
  }

  logEvent(delivery.id, next);
  const updated = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(delivery.id);
  res.json(updated);
});

// ---------- CANCEL (customer, only if still pending) ----------
router.patch("/:id/cancel", requireAuth, requireRole("customer"), (req, res) => {
  const delivery = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(req.params.id);
  if (!delivery) return res.status(404).json({ error: "Delivery not found" });
  if (delivery.customer_id !== req.user.id) return res.status(403).json({ error: "Not your delivery" });
  if (!["pending", "accepted"].includes(delivery.status)) {
    return res.status(409).json({ error: "This delivery can no longer be cancelled" });
  }
  db.prepare(`UPDATE deliveries SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?`).run(delivery.id);
  logEvent(delivery.id, "cancelled", "Cancelled by customer");
  const updated = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(delivery.id);
  res.json(updated);
});

// ---------- TRACK BY CODE (any authenticated user) ----------
router.get("/track/:code", requireAuth, (req, res) => {
  const delivery = db.prepare("SELECT * FROM deliveries WHERE tracking_code = ?").get(req.params.code.toUpperCase());
  if (!delivery) return res.status(404).json({ error: "No delivery found with that tracking code" });
  const events = db.prepare("SELECT * FROM delivery_events WHERE delivery_id = ? ORDER BY created_at ASC").all(delivery.id);
  res.json({ delivery, events });
});

module.exports = router;
