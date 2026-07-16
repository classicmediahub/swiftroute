const crypto = require("crypto");
const { pool } = require("./db");

// Generates a new API key. The full key is only ever shown once at
// creation time — only its SHA-256 hash is stored, so even a database
// leak doesn't expose usable keys. SHA-256 (not bcrypt) is intentional
// here: API keys already have high entropy from crypto.randomBytes, so
// they don't need bcrypt's deliberate slowness the way passwords do —
// and a hot API path getting bcrypt'd on every request would be a real
// performance problem.
function generateApiKey() {
  const raw = crypto.randomBytes(24).toString("hex"); // 48 hex chars
  const key = `pae_live_${raw}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const prefix = key.slice(0, 14); // e.g. "pae_live_a1b2c" — shown in the UI so a key can be identified without ever storing/showing the rest
  return { key, hash, prefix };
}

function hashApiKey(key) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function requireApiKey(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing API key. Use 'Authorization: Bearer pae_live_...'" });
  }
  const key = header.split(" ")[1];
  const hash = hashApiKey(key);

  try {
    const { rows } = await pool.query(
      `SELECT k.*, u.id AS user_id, u.email, u.full_name, u.wallet_balance, u.account_type, u.company_name
       FROM api_keys k JOIN users u ON u.id = k.user_id
       WHERE k.key_hash = $1 AND k.revoked = false`,
      [hash]
    );
    const record = rows[0];
    if (!record) return res.status(401).json({ error: "Invalid or revoked API key" });

    req.merchant = {
      id: record.user_id,
      email: record.email,
      full_name: record.full_name,
      company_name: record.company_name,
      apiKeyId: record.id,
    };

    pool.query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [record.id]).catch(() => {}); // fire-and-forget
    next();
  } catch (err) {
    console.error("API key auth error:", err);
    res.status(500).json({ error: "Something went wrong authenticating this request" });
  }
}

module.exports = { generateApiKey, hashApiKey, requireApiKey };
