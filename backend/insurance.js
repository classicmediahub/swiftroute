const { v4: uuidv4 } = require("uuid");
const { pool } = require("./db");

// ---------- REAL DECLARED-VALUE INSURANCE — see db.js's insurance_claims
// comment. Starting numbers, not researched ones — tune freely, same
// spirit as pricing.js/guarantee.js/elite.js.
const INSURANCE_RATE = 0.02;       // 2% of covered value
const INSURANCE_MIN_PREMIUM = 100; // floor, so a tiny declared value doesn't round to a free premium
const INSURANCE_MAX_COVERAGE = 50000; // matches the landing page's "insured up to ₦50,000"

// declaredValue can exceed the coverage cap (a customer might want an
// accurate record even if only part of it is actually covered) — the
// premium is always charged on the COVERED amount, never the full
// declared value, so nobody pays for protection they don't actually get.
function calculatePremium(declaredValue) {
  const covered = Math.min(Math.max(declaredValue, 0), INSURANCE_MAX_COVERAGE);
  if (covered <= 0) return { covered: 0, premium: 0 };
  const premium = Math.max(Math.round(covered * INSURANCE_RATE), INSURANCE_MIN_PREMIUM);
  return { covered, premium };
}

// Files a new claim. Rejects a second simultaneous claim on the same
// delivery via the unique index in db.js (23505) rather than a
// pre-check — cheaper and race-safe. claim_amount is capped at the
// delivery's actual covered value, regardless of what's requested.
async function fileClaim({ deliveryId, customerId, reason, claimAmount }) {
  const { rows: deliveryRows } = await pool.query(
    "SELECT * FROM deliveries WHERE id = $1 AND customer_id = $2",
    [deliveryId, customerId]
  );
  const delivery = deliveryRows[0];
  if (!delivery) return { ok: false, error: "Delivery not found" };
  if (!delivery.declared_value || !delivery.insurance_premium) {
    return { ok: false, error: "This delivery isn't insured" };
  }
  if (!["delivered", "cancelled"].includes(delivery.status)) {
    return { ok: false, error: "Claims can only be filed once a delivery is delivered or cancelled" };
  }

  const covered = Math.min(delivery.declared_value, INSURANCE_MAX_COVERAGE);
  const amount = Math.min(Math.max(Number(claimAmount) || 0, 0), covered);
  if (amount <= 0) return { ok: false, error: "Claim amount must be greater than zero" };

  try {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO insurance_claims (id, delivery_id, customer_id, reason, claim_amount)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, deliveryId, customerId, reason, amount]
    );
    return { ok: true, id };
  } catch (err) {
    if (err.code === "23505") return { ok: false, error: "There's already an active claim on this delivery" };
    console.error("File claim failed:", err.message);
    return { ok: false, error: "Something went wrong filing this claim" };
  }
}

async function listClaims() {
  const { rows } = await pool.query(`
    SELECT ic.*, d.tracking_code, d.declared_value, u.full_name AS customer_name
    FROM insurance_claims ic
    JOIN deliveries d ON d.id = ic.delivery_id
    JOIN users u ON u.id = ic.customer_id
    ORDER BY ic.status = 'pending' DESC, ic.created_at DESC
  `);
  return rows;
}

// decision: 'approved' or 'rejected'. On approval, the payout lands in
// the customer's wallet immediately — same wallet-credit pattern used
// throughout (streaks, referrals, guarantee, pool rebalance).
async function reviewClaim(claimId, adminId, decision) {
  if (!["approved", "rejected"].includes(decision)) throw new Error("decision must be 'approved' or 'rejected'");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM insurance_claims WHERE id = $1 FOR UPDATE", [claimId]);
    const claim = rows[0];
    if (!claim || claim.status !== "pending") {
      await client.query("ROLLBACK");
      return { ok: false, error: "This claim isn't pending review" };
    }

    if (decision === "approved") {
      const { rows: walletRows } = await client.query(
        "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance",
        [claim.claim_amount, claim.customer_id]
      );
      await client.query(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, delivery_id, note)
         VALUES ($1,$2,'refund',$3,$4,'success',$5,$6)`,
        [uuidv4(), claim.customer_id, claim.claim_amount, walletRows[0].wallet_balance, claim.delivery_id, "Insurance claim approved"]
      );
      await client.query(
        "UPDATE insurance_claims SET status = 'approved', reviewed_by = $1, reviewed_at = now(), payout_amount = $2 WHERE id = $3",
        [adminId, claim.claim_amount, claimId]
      );
    } else {
      await client.query(
        "UPDATE insurance_claims SET status = 'rejected', reviewed_by = $1, reviewed_at = now() WHERE id = $2",
        [adminId, claimId]
      );
    }
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Review claim failed:", err.message);
    return { ok: false, error: "Something went wrong reviewing this claim" };
  } finally {
    client.release();
  }
}

module.exports = { calculatePremium, fileClaim, listClaims, reviewClaim, INSURANCE_RATE, INSURANCE_MIN_PREMIUM, INSURANCE_MAX_COVERAGE };
