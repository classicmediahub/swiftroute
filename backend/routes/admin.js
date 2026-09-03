const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { listAllLockers } = require("../lockers");
const { listClaims, reviewClaim } = require("../insurance");
const { chargeUniformKit, listUniformOrders, advanceUniformStatus } = require("../uniform");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

// ---------- DASHBOARD STATS ----------
router.get("/stats", async (req, res) => {
  try {
    const totalUsers = (await pool.query("SELECT COUNT(*) c FROM users WHERE role = 'customer'")).rows[0].c;
    const totalAgents = (await pool.query("SELECT COUNT(*) c FROM users WHERE role = 'agent'")).rows[0].c;
    const pendingAgents = (await pool.query("SELECT COUNT(*) c FROM agent_profiles WHERE approval_status = 'pending'")).rows[0].c;
    const totalDeliveries = (await pool.query("SELECT COUNT(*) c FROM deliveries")).rows[0].c;
    const activeDeliveries = (await pool.query(
      "SELECT COUNT(*) c FROM deliveries WHERE status IN ('pending','accepted','picked_up','in_transit')"
    )).rows[0].c;
    const completedDeliveries = (await pool.query("SELECT COUNT(*) c FROM deliveries WHERE status = 'delivered'")).rows[0].c;
    const deliveryRevenue = (await pool.query("SELECT COALESCE(SUM(price),0) s FROM deliveries WHERE status = 'delivered'")).rows[0].s;

    // Rides — same shape as the delivery stats above, kept as separate
    // counters rather than merged into the delivery numbers, since a ride
    // and a delivery are different products even though the same cab
    // agents can do both. "Paid" rides count toward revenue the same way
    // "delivered" ones do for parcels (i.e. money that's actually landed,
    // not pending/requested).
    const totalRides = (await pool.query("SELECT COUNT(*) c FROM rides")).rows[0].c;
    const activeRides = (await pool.query(
      "SELECT COUNT(*) c FROM rides WHERE status IN ('pending','accepted','in_progress')"
    )).rows[0].c;
    const completedRides = (await pool.query("SELECT COUNT(*) c FROM rides WHERE status = 'completed'")).rows[0].c;
    const rideRevenue = (await pool.query(
      "SELECT COALESCE(SUM(price),0) s FROM rides WHERE payment_status = 'paid'"
    )).rows[0].s;

    res.json({
      totalUsers: Number(totalUsers),
      totalAgents: Number(totalAgents),
      pendingAgents: Number(pendingAgents),
      totalDeliveries: Number(totalDeliveries),
      activeDeliveries: Number(activeDeliveries),
      completedDeliveries: Number(completedDeliveries),
      revenue: Number(deliveryRevenue) * 0.2,
      totalRides: Number(totalRides),
      activeRides: Number(activeRides),
      completedRides: Number(completedRides),
      rideRevenue: Number(rideRevenue) * 0.2,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading stats" });
  }
});

// ---------- LIST ALL AGENTS ----------
router.get("/agents", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.full_name, u.email, u.phone, u.status, u.created_at, u.profile_photo,
             a.vehicle_type, a.vehicle_make, a.vehicle_plate, a.license_number, a.city,
             a.approval_status, a.is_online, a.rating, a.total_deliveries, a.total_rides, a.wallet_balance
      FROM users u JOIN agent_profiles a ON a.user_id = u.id
      WHERE u.role = 'agent'
      ORDER BY a.approval_status ASC, u.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading agents" });
  }
});

// ---------- APPROVE / REJECT / SUSPEND AGENT ----------
router.patch("/agents/:id/status", async (req, res) => {
  try {
    const { approval_status } = req.body;
    if (!["pending", "approved", "rejected", "suspended"].includes(approval_status)) {
      return res.status(400).json({ error: "Invalid approval status" });
    }
    const { rows } = await pool.query("SELECT * FROM agent_profiles WHERE user_id = $1", [req.params.id]);
    const profile = rows[0];
    if (!profile) return res.status(404).json({ error: "Agent not found" });

    await pool.query("UPDATE agent_profiles SET approval_status = $1 WHERE user_id = $2", [approval_status, req.params.id]);

    // Charge the uniform kit the moment an agent is genuinely newly
    // approved — not on every PATCH that happens to already say
    // "approved" (e.g. an idempotent re-save), only a real transition
    // into it. chargeUniformKit is itself idempotent too (see uniform.js),
    // so this is belt-and-suspenders, not the only thing preventing a
    // double charge.
    if (approval_status === "approved" && profile.approval_status !== "approved") {
      chargeUniformKit(req.params.id).catch((err) =>
        console.error("Uniform kit charge failed (fire-and-forget):", err.message)
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating this agent" });
  }
});

// ---------- LIST ALL CUSTOMERS ----------
router.get("/customers", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, full_name, email, phone, status, created_at
      FROM users WHERE role = 'customer' ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading customers" });
  }
});

// ---------- SUSPEND / REACTIVATE ANY USER ----------
router.patch("/users/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.params.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.role === "admin") return res.status(403).json({ error: "Cannot modify another admin's status" });

    await pool.query("UPDATE users SET status = $1 WHERE id = $2", [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating this user" });
  }
});

// ---------- LIST ALL DELIVERIES ----------
router.get("/deliveries", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT d.*, c.full_name AS customer_name, a.full_name AS agent_name
      FROM deliveries d
      JOIN users c ON c.id = d.customer_id
      LEFT JOIN users a ON a.id = d.agent_id
      ORDER BY d.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading deliveries" });
  }
});

// ---------- LIST ALL RIDES ----------
router.get("/rides", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, c.full_name AS customer_name, a.full_name AS agent_name,
             rr.rating AS review_rating
      FROM rides r
      JOIN users c ON c.id = r.customer_id
      LEFT JOIN users a ON a.id = r.agent_id
      LEFT JOIN ride_reviews rr ON rr.ride_id = r.id
      ORDER BY r.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading rides" });
  }
});

// ---------- LOCKERS — creation itself lives in routes/deliveries.js
// (POST /deliveries/lockers, already admin-gated there) since that's
// where the customer-facing GET /deliveries/lockers already lives; this
// file just adds the admin-only "see everything, toggle active" view on
// top of the same lockers table. ----------
router.get("/lockers", async (req, res) => {
  try {
    res.json(await listAllLockers());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading lockers" });
  }
});

router.patch("/lockers/:id/status", async (req, res) => {
  try {
    const { is_active } = req.body;
    if (typeof is_active !== "boolean") return res.status(400).json({ error: "is_active must be true or false" });
    await pool.query("UPDATE lockers SET is_active = $1 WHERE id = $2", [is_active, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating this locker" });
  }
});

// ---------- INSURANCE CLAIMS — filing itself lives in
// routes/deliveries.js (POST /:id/claim, customer-facing); this is the
// admin-only review side. Approval credits the customer's wallet
// immediately (see insurance.js's reviewClaim). ----------
router.get("/claims", async (req, res) => {
  try {
    res.json(await listClaims());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading claims" });
  }
});

router.patch("/claims/:id/review", async (req, res) => {
  const { decision } = req.body;
  if (!["approved", "rejected"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
  }
  const result = await reviewClaim(req.params.id, req.user.id, decision);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

// ---------- UNIFORM ORDERS — the charge itself happens automatically on
// approval above; this is the admin fulfillment view (who still needs a
// size submitted, who's ready to ship, who's already been sent theirs). ----------
router.get("/uniform-orders", async (req, res) => {
  try {
    res.json(await listUniformOrders());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading uniform orders" });
  }
});

router.patch("/uniform-orders/:id/status", async (req, res) => {
  const { status } = req.body;
  if (!["shipped", "delivered"].includes(status)) {
    return res.status(400).json({ error: "status must be 'shipped' or 'delivered'" });
  }
  const updated = await advanceUniformStatus(req.params.id, status);
  if (!updated) {
    return res.status(409).json({ error: `Couldn't mark as ${status} — check this order's current status` });
  }
  res.json(updated);
});

module.exports = router;
