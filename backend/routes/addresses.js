const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// ---------- LIST (any logged-in role, though in practice only customers
// use this today) ----------
router.get("/", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM saved_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC",
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your saved addresses" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { label, address, city, landmark, lat, lng, is_default } = req.body;
    if (!label || !address || !city) {
      return res.status(400).json({ error: "Label, address, and city are required" });
    }

    const id = uuidv4();
    // If this is being saved as default, clear any existing default first
    // — only one address can hold that title at a time, same "exactly one
    // active X" pattern as an outlet's own is_open toggle elsewhere.
    if (is_default) {
      await pool.query("UPDATE saved_addresses SET is_default = false WHERE user_id = $1", [req.user.id]);
    }

    const { rows } = await pool.query(
      `INSERT INTO saved_addresses (id, user_id, label, address, city, landmark, lat, lng, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, req.user.id, label, address, city, landmark ?? null, lat ?? null, lng ?? null, Boolean(is_default)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong saving this address" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const { label, address, city, landmark, lat, lng, is_default } = req.body;

    if (is_default) {
      await pool.query("UPDATE saved_addresses SET is_default = false WHERE user_id = $1", [req.user.id]);
    }

    const { rows } = await pool.query(
      `UPDATE saved_addresses SET
        label = COALESCE($1, label), address = COALESCE($2, address), city = COALESCE($3, city),
        landmark = COALESCE($4, landmark), lat = COALESCE($5, lat), lng = COALESCE($6, lng),
        is_default = COALESCE($7, is_default)
       WHERE id = $8 AND user_id = $9 RETURNING *`,
      [label, address, city, landmark, lat, lng, is_default, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Address not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating this address" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "DELETE FROM saved_addresses WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Address not found" });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong removing this address" });
  }
});

module.exports = router;
