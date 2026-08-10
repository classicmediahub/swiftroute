const { v4: uuidv4 } = require("uuid");
const { pool } = require("./db");

// ---------- GUARANTEED DELIVERY WINDOWS — a premium opt-in at creation
// time. Starting numbers, not researched ones — tune freely, same spirit
// as pricing.js/streaks.js/pooling.js.
const GUARANTEE_FEE = 300;     // flat surcharge added to price when opted in
const GUARANTEE_PENALTY = 500; // flat wallet credit if the window is missed

// Called at the moment a guaranteed delivery's package is actually handed
// off — see db.js's comment on what "handed off" means per delivery type.
// Safe to call on every delivery (guaranteed or not); it's a no-op unless
// guaranteed is true, the penalty hasn't already been paid, and the
// handoff genuinely happened after the estimated window.
async function checkGuaranteeBreach(delivery, completedAt = new Date()) {
  if (!delivery.guaranteed || delivery.guarantee_penalty_paid) return false;
  if (!delivery.estimated_delivery_at) return false;
  if (completedAt.getTime() <= new Date(delivery.estimated_delivery_at).getTime()) return false;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: walletRows } = await client.query(
      "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance",
      [GUARANTEE_PENALTY, delivery.customer_id]
    );
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, delivery_id, note)
       VALUES ($1,$2,'refund',$3,$4,'success',$5,$6)`,
      [uuidv4(), delivery.customer_id, GUARANTEE_PENALTY, walletRows[0].wallet_balance, delivery.id, "Guaranteed delivery window missed \u2014 penalty credit"]
    );
    await client.query("UPDATE deliveries SET guarantee_penalty_paid = true WHERE id = $1", [delivery.id]);
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Guarantee penalty credit failed:", err.message);
    return false; // never throws — a penalty-credit failure should never block the delivery status update calling it
  } finally {
    client.release();
  }
}

module.exports = { checkGuaranteeBreach, GUARANTEE_FEE, GUARANTEE_PENALTY };
