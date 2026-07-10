const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

// ---------- DASHBOARD STATS ----------
router.get("/stats", (req, res) => {
  const totalUsers = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'customer'").get().c;
  const totalAgents = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'agent'").get().c;
  const pendingAgents = db.prepare("SELECT COUNT(*) c FROM agent_profiles WHERE approval_status = 'pending'").get().c;
  const totalDeliveries = db.prepare("SELECT COUNT(*) c FROM deliveries").get().c;
  const activeDeliveries = db.prepare("SELECT COUNT(*) c FROM deliveries WHERE status IN ('pending','accepted','picked_up','in_transit')").get().c;
  const completedDeliveries = db.prepare("SELECT COUNT(*) c FROM deliveries WHERE status = 'delivered'").get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(price),0) s FROM deliveries WHERE status = 'delivered'").get().s;
  res.json({ totalUsers, totalAgents, pendingAgents, totalDeliveries, activeDeliveries, completedDeliveries, revenue: revenue * 0.2 });
});

// ---------- LIST ALL AGENTS ----------
router.get("/agents", (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.phone, u.status, u.created_at,
           a.vehicle_type, a.vehicle_make, a.vehicle_plate, a.license_number, a.city,
           a.approval_status, a.is_online, a.rating, a.total_deliveries, a.wallet_balance
    FROM users u JOIN agent_profiles a ON a.user_id = u.id
    WHERE u.role = 'agent'
    ORDER BY a.approval_status ASC, u.created_at DESC
  `).all();
  res.json(rows);
});

// ---------- APPROVE / REJECT / SUSPEND AGENT ----------
router.patch("/agents/:id/status", (req, res) => {
  const { approval_status } = req.body;
  if (!["pending", "approved", "rejected", "suspended"].includes(approval_status)) {
    return res.status(400).json({ error: "Invalid approval status" });
  }
  const profile = db.prepare("SELECT * FROM agent_profiles WHERE user_id = ?").get(req.params.id);
  if (!profile) return res.status(404).json({ error: "Agent not found" });
  db.prepare("UPDATE agent_profiles SET approval_status = ? WHERE user_id = ?").run(approval_status, req.params.id);
  res.json({ success: true });
});

// ---------- LIST ALL CUSTOMERS ----------
router.get("/customers", (req, res) => {
  const rows = db.prepare(`
    SELECT id, full_name, email, phone, status, created_at
    FROM users WHERE role = 'customer' ORDER BY created_at DESC
  `).all();
  res.json(rows);
});

// ---------- SUSPEND / REACTIVATE ANY USER ----------
router.patch("/users/:id/status", (req, res) => {
  const { status } = req.body;
  if (!["active", "suspended"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role === "admin") return res.status(403).json({ error: "Cannot modify another admin's status" });
  db.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, req.params.id);
  res.json({ success: true });
});

// ---------- LIST ALL DELIVERIES ----------
router.get("/deliveries", (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, c.full_name AS customer_name, a.full_name AS agent_name
    FROM deliveries d
    JOIN users c ON c.id = d.customer_id
    LEFT JOIN users a ON a.id = d.agent_id
    ORDER BY d.created_at DESC
  `).all();
  res.json(rows);
});

module.exports = router;
