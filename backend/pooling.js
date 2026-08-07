const { v4: uuidv4 } = require("uuid");
const { pool } = require("./db");
const { initializeTransaction } = require("./paystack");

// ---------- DELIVERY POOLING (campus clusters) — customers going to the
// same institution within a short window can share one agent trip and
// split the cost. Discount model, chosen deliberately: EVERYONE in a pool
// gets re-priced to match the group's final size, including members who
// already paid — refunded to wallet if already paid, or reissued a fresh
// lower-amount Paystack link if still unpaid. This is more generous (and
// more work) than "only new joiners get a discount," which was the
// simpler zero-refund alternative — see rebalancePoolPricing.
const POOL_WINDOW_MINUTES = 20;
const POOL_MAX_SIZE = 4;
const POOL_DISCOUNT_BY_SIZE = { 1: 0, 2: 0.10, 3: 0.15, 4: 0.20 }; // starting numbers, tune freely

function discountForSize(size) {
  const capped = Math.min(Math.max(size, 1), POOL_MAX_SIZE);
  return POOL_DISCOUNT_BY_SIZE[capped] ?? POOL_DISCOUNT_BY_SIZE[POOL_MAX_SIZE];
}

// Finds an open, non-expired, non-full pool for this institution, or
// creates a new one. Must be called with a client already inside a
// transaction — locks the chosen pool row (FOR UPDATE) so two deliveries
// created at the same instant can't both believe they're "member #2".
async function findOrCreatePool(client, institutionId) {
  const { rows } = await client.query(
    `SELECT dp.id, count(d.id) AS member_count
     FROM delivery_pools dp
     LEFT JOIN deliveries d ON d.pool_id = dp.id
     WHERE dp.institution_id = $1 AND dp.status = 'open' AND dp.expires_at > now()
     GROUP BY dp.id
     HAVING count(d.id) < $2
     ORDER BY dp.created_at ASC
     LIMIT 1
     FOR UPDATE OF dp`,
    [institutionId, POOL_MAX_SIZE]
  );
  if (rows[0]) {
    return { poolId: rows[0].id, priorMemberCount: Number(rows[0].member_count) };
  }
  const id = uuidv4();
  const expiresAt = new Date(Date.now() + POOL_WINDOW_MINUTES * 60000);
  await client.query(
    "INSERT INTO delivery_pools (id, institution_id, status, expires_at) VALUES ($1,$2,'open',$3)",
    [id, institutionId, expiresAt]
  );
  return { poolId: id, priorMemberCount: 0 };
}

// Called AFTER a new member's own delivery row is inserted (already
// correctly priced at insert time) — re-prices every OTHER member of the
// pool to match the new group size. Never throws; a rebalance failure for
// one member is logged and skipped rather than blocking the delivery that
// was actually just being created.
async function rebalancePoolPricing(poolId, newMemberCount, newDeliveryId, frontendUrl) {
  const discount = discountForSize(newMemberCount);
  const { rows: members } = await pool.query(
    "SELECT * FROM deliveries WHERE pool_id = $1 AND id != $2",
    [poolId, newDeliveryId]
  );

  for (const d of members) {
    const basePrice = d.pool_original_price ?? d.price;
    const newPrice = Math.round((basePrice * (1 - discount)) / 50) * 50;
    const diff = d.price - newPrice;
    if (diff <= 0) continue; // already at or better than this discount

    if (d.payment_status === "paid") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: walletRows } = await client.query(
          "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance",
          [diff, d.customer_id]
        );
        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, delivery_id, note)
           VALUES ($1,$2,'refund',$3,$4,'success',$5,$6)`,
          [uuidv4(), d.customer_id, diff, walletRows[0].wallet_balance, d.id, `Pool discount refund \u2014 group grew to ${newMemberCount}`]
        );
        await client.query("UPDATE deliveries SET price = $1 WHERE id = $2", [newPrice, d.id]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("Pool refund failed for delivery", d.id, err.message);
      } finally {
        client.release();
      }
    } else {
      // Still unpaid — reissue a fresh, lower-amount Paystack link rather
      // than leaving the stale higher-amount one active.
      // KNOWN LIMITATION: if the customer already has the OLD checkout
      // page open and completes payment before this new link reaches
      // them, they'll be charged the old (higher) amount. Reconciling
      // that would require changes in the payment verify/webhook path,
      // which this feature doesn't touch. In practice this is a narrow
      // race — the old page would need to be paid within seconds of the
      // group crossing a new discount tier.
      try {
        const { rows: userRows } = await pool.query("SELECT email FROM users WHERE id = $1", [d.customer_id]);
        const newReference = `PAE-POOL-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        await initializeTransaction({
          email: userRows[0].email,
          amountNaira: newPrice,
          reference: newReference,
          callback_url: `${frontendUrl}/payment/callback`,
          metadata: { delivery_id: d.id, pool_rebalanced: true },
        });
        await pool.query(
          "UPDATE deliveries SET price = $1, paystack_reference = $2 WHERE id = $3",
          [newPrice, newReference, d.id]
        );
      } catch (err) {
        console.error("Pool re-price (unpaid) failed for delivery", d.id, err.message);
      }
    }
  }
}

async function getPool(poolId) {
  const { rows } = await pool.query("SELECT * FROM delivery_pools WHERE id = $1", [poolId]);
  return rows[0] || null;
}

async function listPoolMembers(poolId) {
  const { rows } = await pool.query(
    `SELECT d.*, i.name AS institution_name
     FROM deliveries d JOIN institutions i ON i.id = d.institution_id
     WHERE d.pool_id = $1 ORDER BY d.created_at ASC`,
    [poolId]
  );
  return rows;
}

// Assigns ONE agent to every still-pending member of a pool in a single
// atomic step, and closes the pool to new joiners. Returns the list of
// delivery ids that were actually assigned, or null if the pool was
// already claimed / had nothing left to assign (race-safe via FOR UPDATE
// on the pool row).
async function claimPool(poolId, agentId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: poolRows } = await client.query(
      "SELECT * FROM delivery_pools WHERE id = $1 FOR UPDATE",
      [poolId]
    );
    const poolRow = poolRows[0];
    if (!poolRow || poolRow.status !== "open") {
      await client.query("ROLLBACK");
      return null;
    }

    const { rows: members } = await client.query(
      "SELECT id FROM deliveries WHERE pool_id = $1 AND status = 'pending' AND payment_status = 'paid' FOR UPDATE",
      [poolId]
    );
    if (members.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const ids = members.map((m) => m.id);
    await client.query(
      "UPDATE deliveries SET status = 'accepted', agent_id = $1, accepted_at = now() WHERE id = ANY($2)",
      [agentId, ids]
    );
    await client.query(
      "UPDATE delivery_pools SET status = 'claimed', agent_id = $1 WHERE id = $2",
      [agentId, poolId]
    );
    await client.query("COMMIT");
    return ids;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Pool claim failed:", err.message);
    return null;
  } finally {
    client.release();
  }
}

// Every open pool with 2+ members and at least one still-pending delivery,
// grouped for the "available jobs" agent view — see routes/deliveries.js.
async function listClaimablePools() {
  const { rows } = await pool.query(
    `SELECT dp.id AS pool_id, dp.institution_id, i.name AS institution_name, count(d.id) AS member_count
     FROM delivery_pools dp
     JOIN institutions i ON i.id = dp.institution_id
     JOIN deliveries d ON d.pool_id = dp.id AND d.status = 'pending' AND d.payment_status = 'paid'
     WHERE dp.status = 'open' AND dp.expires_at > now()
     GROUP BY dp.id, dp.institution_id, i.name
     HAVING count(d.id) >= 2
     ORDER BY dp.created_at ASC`
  );
  return rows;
}

module.exports = {
  findOrCreatePool, rebalancePoolPricing, getPool, listPoolMembers, claimPool, listClaimablePools,
  discountForSize, POOL_WINDOW_MINUTES, POOL_MAX_SIZE,
};
