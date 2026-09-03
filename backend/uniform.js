const { v4: uuidv4 } = require("uuid");
const { pool } = require("./db");

// Starting number, not a researched one — tune freely, same spirit as
// GUARANTEE_FEE/ELITE_FEE/JOB_BOOST_FEE elsewhere in this codebase.
const UNIFORM_FEE = 10000;

// Called once, automatically, the moment an agent is first approved (see
// routes/admin.js's PATCH /agents/:id/status). Idempotent two ways: the
// caller only invokes this on a genuine pending/rejected/suspended ->
// approved transition, and this function itself checks for an existing
// row before charging, so even a duplicate call (a retried request, a
// race) can never charge someone twice. Never throws — a charging
// failure here should log loudly but must not block the approval itself
// from going through; an agent shouldn't stay stuck unapproved because
// of a wallet-debit bug.
async function chargeUniformKit(agentId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existing } = await client.query(
      "SELECT id FROM uniform_orders WHERE agent_id = $1 FOR UPDATE",
      [agentId]
    );
    if (existing.length > 0) {
      await client.query("ROLLBACK");
      return { charged: false, reason: "Already has a uniform order" };
    }

    const { rows: profileRows } = await client.query(
      "SELECT wallet_balance FROM agent_profiles WHERE user_id = $1 FOR UPDATE",
      [agentId]
    );
    if (!profileRows[0]) {
      await client.query("ROLLBACK");
      return { charged: false, reason: "Agent profile not found" };
    }

    // Deliberately allowed to go negative — see db.js's comment on
    // uniform_orders. This is a starter kit issued on credit, not a
    // balance check gate.
    const newBalance = Number(profileRows[0].wallet_balance) - UNIFORM_FEE;
    await client.query("UPDATE agent_profiles SET wallet_balance = $1 WHERE user_id = $2", [newBalance, agentId]);

    const orderId = uuidv4();
    await client.query(
      `INSERT INTO uniform_orders (id, agent_id, amount, status)
       VALUES ($1,$2,$3,'awaiting_size')`,
      [orderId, agentId, UNIFORM_FEE]
    );
    await client.query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, note)
       VALUES ($1,$2,'uniform_purchase',$3,$4,'success',$5)`,
      [uuidv4(), agentId, -UNIFORM_FEE, newBalance, "Uniform kit (cloth + cap)"]
    );

    await client.query("COMMIT");
    return { charged: true, orderId };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Uniform kit charge failed for agent", agentId, ":", err.message);
    return { charged: false, reason: "error" };
  } finally {
    client.release();
  }
}

async function getMyUniformOrder(agentId) {
  const { rows } = await pool.query("SELECT * FROM uniform_orders WHERE agent_id = $1", [agentId]);
  return rows[0] || null;
}

async function submitUniformSize(agentId, clothSize) {
  const { rows } = await pool.query(
    `UPDATE uniform_orders SET cloth_size = $1, status = 'pending', size_submitted_at = now()
     WHERE agent_id = $2 AND status = 'awaiting_size'
     RETURNING *`,
    [clothSize, agentId]
  );
  return rows[0] || null;
}

async function listUniformOrders() {
  const { rows } = await pool.query(`
    SELECT uo.*, u.full_name AS agent_name, u.phone AS agent_phone, ap.city
    FROM uniform_orders uo
    JOIN users u ON u.id = uo.agent_id
    JOIN agent_profiles ap ON ap.user_id = uo.agent_id
    ORDER BY
      CASE uo.status WHEN 'pending' THEN 0 WHEN 'shipped' THEN 1 WHEN 'awaiting_size' THEN 2 ELSE 3 END,
      uo.created_at ASC
  `);
  return rows;
}

// next: 'shipped' or 'delivered' — only ever moves forward
// (pending -> shipped -> delivered), enforced by the WHERE clause rather
// than trusting the caller to send states in order.
async function advanceUniformStatus(orderId, next) {
  const fromStatus = next === "shipped" ? "pending" : "shipped";
  const timestampCol = next === "shipped" ? "shipped_at" : "delivered_at";
  const { rows } = await pool.query(
    `UPDATE uniform_orders SET status = $1, ${timestampCol} = now()
     WHERE id = $2 AND status = $3
     RETURNING *`,
    [next, orderId, fromStatus]
  );
  return rows[0] || null;
}

module.exports = {
  UNIFORM_FEE, chargeUniformKit, getMyUniformOrder, submitUniformSize,
  listUniformOrders, advanceUniformStatus,
};
