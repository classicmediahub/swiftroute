const express = require("express");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

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
    const revenue = (await pool.query("SELECT COALESCE(SUM(price),0) s FROM deliveries WHERE status = 'delivered'")).rows[0].s;

    res.json({
      totalUsers: Number(totalUsers),
      totalAgents: Number(totalAgents),
      pendingAgents: Number(pendingAgents),
      totalDeliveries: Number(totalDeliveries),
      activeDeliveries: Number(activeDeliveries),
      completedDeliveries: Number(completedDeliveries),
      revenue: Number(revenue) * 0.2,
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
             a.approval_status, a.is_online, a.rating, a.total_deliveries, a.wallet_balance
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
    if (!rows[0]) return res.status(404).json({ error: "Agent not found" });

    await pool.query("UPDATE agent_profiles SET approval_status = $1 WHERE user_id = $2", [approval_status, req.params.id]);
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

module.exports = router;
