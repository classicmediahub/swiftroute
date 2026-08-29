const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// ================= PUBLIC BROWSING (no login required — same as
// browsing a menu before you decide to order, matching how nearby
// drivers/public tracking work elsewhere in this app) =================

router.get("/", async (req, res) => {
  try {
    const { city, category } = req.query;
    const conditions = ["approval_status = 'approved'"];
    const params = [];
    if (city) { params.push(city); conditions.push(`city = $${params.length}`); }
    if (category) { params.push(category); conditions.push(`category = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT o.user_id, o.business_name, o.category, o.description, o.address, o.city,
              o.logo_photo, o.cover_photo, o.open_time, o.close_time, o.is_open
       FROM outlet_profiles o WHERE ${conditions.join(" AND ")} ORDER BY o.business_name ASC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading outlets" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { rows: outletRows } = await pool.query(
      `SELECT o.*, u.phone FROM outlet_profiles o JOIN users u ON u.id = o.user_id
       WHERE o.user_id = $1 AND o.approval_status = 'approved'`,
      [req.params.id]
    );
    const outlet = outletRows[0];
    if (!outlet) return res.status(404).json({ error: "Outlet not found" });

    const { rows: menu } = await pool.query(
      "SELECT * FROM menu_items WHERE outlet_id = $1 ORDER BY category NULLS LAST, name ASC",
      [req.params.id]
    );
    res.json({ ...outlet, menu });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading this outlet" });
  }
});

// ================= OUTLET'S OWN PROFILE + MENU (requires login) =================

router.get("/me/profile", requireAuth, requireRole("outlet"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM outlet_profiles WHERE user_id = $1", [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: "Outlet profile not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your profile" });
  }
});

router.patch("/me/profile", requireAuth, requireRole("outlet"), async (req, res) => {
  try {
    const { business_name, description, address, city, open_time, close_time, logo_photo, cover_photo } = req.body;
    const { rows } = await pool.query(
      `UPDATE outlet_profiles SET
        business_name = COALESCE($1, business_name), description = COALESCE($2, description),
        address = COALESCE($3, address), city = COALESCE($4, city),
        open_time = COALESCE($5, open_time), close_time = COALESCE($6, close_time),
        logo_photo = COALESCE($7, logo_photo), cover_photo = COALESCE($8, cover_photo)
       WHERE user_id = $9 RETURNING *`,
      [business_name, description, address, city, open_time, close_time, logo_photo, cover_photo, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating your profile" });
  }
});

router.patch("/me/toggle-open", requireAuth, requireRole("outlet"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE outlet_profiles SET is_open = NOT is_open WHERE user_id = $1 RETURNING is_open",
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

router.get("/me/menu", requireAuth, requireRole("outlet"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM menu_items WHERE outlet_id = $1 ORDER BY category NULLS LAST, name ASC",
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your menu" });
  }
});

router.post("/me/menu", requireAuth, requireRole("outlet"), async (req, res) => {
  try {
    const { name, description, price, category, photo } = req.body;
    if (!name || !Number.isFinite(Number(price)) || Number(price) <= 0) {
      return res.status(400).json({ error: "A name and a valid price are required" });
    }
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO menu_items (id, outlet_id, name, description, price, category, photo)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, req.user.id, name, description ?? null, price, category ?? null, photo ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong adding this item" });
  }
});

router.patch("/me/menu/:id", requireAuth, requireRole("outlet"), async (req, res) => {
  try {
    const { name, description, price, category, photo } = req.body;
    const { rows } = await pool.query(
      `UPDATE menu_items SET
        name = COALESCE($1, name), description = COALESCE($2, description),
        price = COALESCE($3, price), category = COALESCE($4, category), photo = COALESCE($5, photo)
       WHERE id = $6 AND outlet_id = $7 RETURNING *`,
      [name, description, price, category, photo, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Item not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating this item" });
  }
});

router.patch("/me/menu/:id/toggle", requireAuth, requireRole("outlet"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE menu_items SET is_available = NOT is_available WHERE id = $1 AND outlet_id = $2 RETURNING *",
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Item not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

router.delete("/me/menu/:id", requireAuth, requireRole("outlet"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "DELETE FROM menu_items WHERE id = $1 AND outlet_id = $2 RETURNING id",
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Item not found" });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong removing this item" });
  }
});

// ================= ADMIN APPROVAL (embedded here rather than in
// admin.js, same pattern routes/withdrawals.js already established) =================

router.get("/admin/pending", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, u.email, u.phone AS owner_phone, u.full_name AS owner_name
       FROM outlet_profiles o JOIN users u ON u.id = o.user_id
       WHERE o.approval_status = 'pending' ORDER BY o.created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading pending outlets" });
  }
});

router.patch("/admin/:id/approve", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE outlet_profiles SET approval_status = 'approved' WHERE user_id = $1 RETURNING *",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Outlet not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong approving this outlet" });
  }
});

router.patch("/admin/:id/reject", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE outlet_profiles SET approval_status = 'rejected' WHERE user_id = $1 RETURNING *",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Outlet not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong rejecting this outlet" });
  }
});

module.exports = router;
