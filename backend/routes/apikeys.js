const express = require("express");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { generateApiKey } = require("../apiKeyAuth");

const router = express.Router();
router.use(requireAuth, requireRole("customer"));

// ---------- LIST API KEYS (never returns the actual key, only the prefix) ----------
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, label, key_prefix, last_used_at, revoked, created_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your API keys" });
  }
});

// ---------- CREATE A NEW API KEY (shown once, never retrievable again) ----------
router.post("/", async (req, res) => {
  try {
    const label = (req.body.label || "").trim() || "Untitled key";
    const { key, hash, prefix } = generateApiKey();
    const id = uuidv4();

    await pool.query(
      `INSERT INTO api_keys (id, user_id, label, key_prefix, key_hash) VALUES ($1, $2, $3, $4, $5)`,
      [id, req.user.id, label, prefix, hash]
    );

    res.status(201).json({ id, label, key, key_prefix: prefix });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong creating this API key" });
  }
});

// ---------- REVOKE AN API KEY ----------
router.delete("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM api_keys WHERE id = $1", [req.params.id]);
    const key = rows[0];
    if (!key) return res.status(404).json({ error: "API key not found" });
    if (key.user_id !== req.user.id) return res.status(403).json({ error: "Not your API key" });

    await pool.query("UPDATE api_keys SET revoked = true WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong revoking this key" });
  }
});

// ---------- WEBHOOK CONFIG ----------
router.get("/webhook", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT webhook_url, webhook_secret FROM users WHERE id = $1", [req.user.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your webhook settings" });
  }
});

router.put("/webhook", async (req, res) => {
  try {
    const url = (req.body.webhook_url || "").trim();
    if (url && !/^https?:\/\//.test(url)) {
      return res.status(400).json({ error: "Webhook URL must start with http:// or https://" });
    }

    const { rows } = await pool.query("SELECT webhook_secret FROM users WHERE id = $1", [req.user.id]);
    let secret = rows[0].webhook_secret;
    if (url && !secret) {
      secret = crypto.randomBytes(24).toString("hex");
    }
    if (!url) secret = null; // clear the secret if the webhook is being removed

    await pool.query("UPDATE users SET webhook_url = $1, webhook_secret = $2 WHERE id = $3", [url || null, secret, req.user.id]);
    res.json({ webhook_url: url || null, webhook_secret: secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong saving your webhook settings" });
  }
});

module.exports = router;
