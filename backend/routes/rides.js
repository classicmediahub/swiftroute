const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getRideQuote } = require("../quote");
const { initializeTransaction, verifyTransaction } = require("../paystack");
const { notifyRideCustomer } = require("../notify");

const router = express.Router();

function paymentReference() {
  // Distinct prefix from deliveries' "PAEPAY-" and wallet's "PAEWALLET-" —
  // this is how the Paystack webhook (routes/webhooks.js) tells a ride
  // payment apart from the others and confirms the right row.
  return `PAERIDE-${uuidv4().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}

function isValidCoords(c) {
  return c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)) &&
    Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;
}

function callbackUrl() {
  // Its own dedicated callback path, same pattern as deliveries'
  // /payment/callback and wallet's own callback — each payment type gets
  // its own frontend page so verification hits the right endpoint.
  const base = process.env.FRONTEND_URL || "http://localhost:5173";
  return `${base.replace(/\/$/, "")}/ride/payment/callback`;
}

// Recomputes an agent's single blended rating across BOTH delivery
// reviews and ride reviews, and writes it back to agent_profiles. Called
// after any new ride review — the delivery-side review endpoint (not
// touched by this file) presumably does the equivalent after a delivery
// review, so both paths converge on the same combined number.
async function recomputeAgentRating(agentId) {
  const { rows } = await pool.query(
    `SELECT AVG(rating)::float AS avg_rating FROM (
       SELECT rating FROM reviews WHERE agent_id = $1
       UNION ALL
       SELECT rating FROM ride_reviews WHERE agent_id = $1
     ) combined`,
    [agentId]
  );
  const avg = rows[0]?.avg_rating;
  if (avg != null) {
    await pool.query("UPDATE agent_profiles SET rating = $1 WHERE user_id = $2", [avg, agentId]);
  }
}

// ---------- FARE ESTIMATE (customer) — called after pickup/dropoff pins
// are confirmed on the map, before requesting the ride. ----------
router.post("/estimate", requireAuth, async (req, res) => {
  const { pickup_address, dropoff_address, pickup_coords, dropoff_coords } = req.body;
  if (!isValidCoords(pickup_coords) || !isValidCoords(dropoff_coords)) {
    return res.status(400).json({ error: "Confirmed pickup and drop-off locations are required" });
  }
  const quote = await getRideQuote({ pickup_address, dropoff_address, pickup_coords, dropoff_coords });
  if (!quote) {
    return res.status(502).json({ error: "Couldn't calculate a fare for this route right now. Try again in a moment." });
  }
  res.json(quote);
});

// ---------- REQUEST A RIDE (customer) — creates the ride as unpaid, then
// starts a Paystack transaction. The ride only becomes visible to nearby
// cab agents once payment is confirmed, same rule as paid deliveries. ----------
router.post("/", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { pickup_address, dropoff_address, pickup_coords, dropoff_coords } = req.body;
    if (!pickup_address || !dropoff_address || !isValidCoords(pickup_coords) || !isValidCoords(dropoff_coords)) {
      return res.status(400).json({ error: "Confirmed pickup and drop-off locations are required" });
    }

    const quote = await getRideQuote({ pickup_address, dropoff_address, pickup_coords, dropoff_coords });
    if (!quote) {
      return res.status(502).json({ error: "Couldn't calculate a fare for this route right now. Try again in a moment." });
    }

    const id = uuidv4();
    const reference = paymentReference();

    await pool.query(
      `INSERT INTO rides (
        id, customer_id, pickup_address, pickup_lat, pickup_lng,
        dropoff_address, dropoff_lat, dropoff_lng, price, distance_km,
        payment_status, paystack_reference
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'unpaid',$11)`,
      [id, req.user.id, pickup_address, pickup_coords.lat, pickup_coords.lng,
       dropoff_address, dropoff_coords.lat, dropoff_coords.lng, quote.price, quote.distanceKm, reference]
    );

    let authorization_url;
    try {
      const paystackData = await initializeTransaction({
        email: req.user.email,
        amountNaira: quote.price,
        reference,
        callback_url: callbackUrl(),
        metadata: { ride_id: id },
      });
      authorization_url = paystackData.authorization_url;
    } catch (err) {
      console.error("Paystack initialize failed for ride:", err.message);
      const { rows } = await pool.query("SELECT * FROM rides WHERE id = $1", [id]);
      // Ride row exists but unpaid — customer can retry from "My rides"
      // via /retry-payment below, same recovery path as deliveries.
      return res.status(502).json({
        error: "We couldn't start payment right now. Your ride request was saved — try paying again from My rides.",
        ride: rows[0],
      });
    }

    const { rows } = await pool.query("SELECT * FROM rides WHERE id = $1", [id]);
    res.status(201).json({ ride: rows[0], authorization_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong requesting the ride" });
  }
});

// ---------- RETRY PAYMENT (customer) ----------
router.post("/:id/retry-payment", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM rides WHERE id = $1", [req.params.id]);
    const ride = rows[0];
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.customer_id !== req.user.id) return res.status(403).json({ error: "Not your ride" });
    if (ride.payment_status === "paid") return res.status(409).json({ error: "This ride is already paid for" });

    const reference = paymentReference();
    await pool.query("UPDATE rides SET paystack_reference = $1, payment_status = 'unpaid' WHERE id = $2", [reference, ride.id]);

    const paystackData = await initializeTransaction({
      email: req.user.email,
      amountNaira: ride.price,
      reference,
      callback_url: callbackUrl(),
      metadata: { ride_id: ride.id },
    });

    res.json({ authorization_url: paystackData.authorization_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not restart payment. Please try again." });
  }
});

// ---------- VERIFY PAYMENT (customer) — called by the frontend when
// Paystack redirects back after checkout. ----------
router.get("/verify/:reference", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM rides WHERE paystack_reference = $1", [req.params.reference]);
    const ride = rows[0];
    if (!ride) return res.status(404).json({ error: "No ride found for this payment reference" });
    if (ride.customer_id !== req.user.id) return res.status(403).json({ error: "Not your ride" });

    if (ride.payment_status === "paid") {
      return res.json({ ride, payment_status: "paid" });
    }

    const txn = await verifyTransaction(req.params.reference);
    if (txn.status === "success") {
      await pool.query("UPDATE rides SET payment_status = 'paid' WHERE id = $1", [ride.id]);
    } else {
      await pool.query("UPDATE rides SET payment_status = 'failed' WHERE id = $1", [ride.id]);
    }

    const { rows: updated } = await pool.query("SELECT * FROM rides WHERE id = $1", [ride.id]);
    if (updated[0].payment_status === "paid") {
      notifyRideCustomer(updated[0], "payment_confirmed"); // fire-and-forget
    }
    res.json({ ride: updated[0], payment_status: updated[0].payment_status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong verifying payment" });
  }
});

// ---------- MY RIDES (customer) — includes whether this ride already has
// a review, so the frontend knows when to show the review form vs. a
// "you rated this X stars" summary instead. ----------
router.get("/mine", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.full_name AS agent_name, u.phone AS agent_phone, u.profile_photo AS agent_photo,
              rr.rating AS review_rating, rr.comment AS review_comment
       FROM rides r
       LEFT JOIN users u ON u.id = r.agent_id
       LEFT JOIN ride_reviews rr ON rr.ride_id = r.id
       WHERE r.customer_id = $1 ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your rides" });
  }
});

// ---------- SUBMIT A REVIEW (customer, own completed ride only, one per
// ride — enforced by ride_reviews.ride_id being UNIQUE). ----------
router.post("/:id/review", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const rating = Number(req.body.rating);
    const comment = (req.body.comment || "").trim().slice(0, 1000);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be a whole number from 1 to 5" });
    }

    const { rows } = await pool.query("SELECT * FROM rides WHERE id = $1", [req.params.id]);
    const ride = rows[0];
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.customer_id !== req.user.id) return res.status(403).json({ error: "Not your ride" });
    if (ride.status !== "completed") return res.status(409).json({ error: "You can only review a completed ride" });
    if (!ride.agent_id) return res.status(409).json({ error: "This ride has no driver to review" });

    try {
      await pool.query(
        `INSERT INTO ride_reviews (id, ride_id, customer_id, agent_id, rating, comment)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), ride.id, req.user.id, ride.agent_id, rating, comment || null]
      );
    } catch (err) {
      if (err.code === "23505") { // unique_violation on ride_id
        return res.status(409).json({ error: "You've already reviewed this ride" });
      }
      throw err;
    }

    await recomputeAgentRating(ride.agent_id);

    const { rows: updated } = await pool.query(
      `SELECT r.*, rr.rating AS review_rating, rr.comment AS review_comment
       FROM rides r LEFT JOIN ride_reviews rr ON rr.ride_id = r.id WHERE r.id = $1`,
      [ride.id]
    );
    res.status(201).json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong submitting your review" });
  }
});

// ---------- CANCEL (customer, only if still pending/accepted) ----------
router.patch("/:id/cancel", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM rides WHERE id = $1", [req.params.id]);
    const ride = rows[0];
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.customer_id !== req.user.id) return res.status(403).json({ error: "Not your ride" });
    if (!["pending", "accepted"].includes(ride.status)) {
      return res.status(409).json({ error: "This ride can no longer be cancelled" });
    }

    await pool.query("UPDATE rides SET status = 'cancelled', cancelled_at = now() WHERE id = $1", [ride.id]);
    // No auto-refund here (rides are Paystack-only, no wallet payment
    // option) — same manual-refund note as deliveries: a paid, cancelled
    // ride needs a real Paystack refund done separately for now.

    const { rows: updated } = await pool.query("SELECT * FROM rides WHERE id = $1", [ride.id]);
    notifyRideCustomer(updated[0], "cancelled"); // fire-and-forget
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong cancelling this ride" });
  }
});

// ---------- AVAILABLE RIDES (cab agents only) — paid only, broadcast to
// every online approved cab agent; first to accept gets it, same
// first-to-accept model as deliveries. ----------
router.get("/available", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows: profileRows } = await pool.query("SELECT * FROM agent_profiles WHERE user_id = $1", [req.user.id]);
    const profile = profileRows[0];
    if (!profile) return res.status(400).json({ error: "Agent profile not found" });
    if (profile.approval_status !== "approved") {
      return res.status(403).json({ error: "Your agent account is pending admin approval" });
    }
    if (profile.vehicle_type !== "cab") {
      return res.json([]); // rides are cab-only in phase 1 — not an error, just nothing to show
    }

    const { rows } = await pool.query(
      `SELECT r.*, u.full_name AS customer_name, u.phone AS customer_phone
       FROM rides r JOIN users u ON u.id = r.customer_id
       WHERE r.status = 'pending' AND r.payment_status = 'paid'
       ORDER BY r.created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading available rides" });
  }
});

// ---------- MY ASSIGNED RIDES (agent) ----------
router.get("/assigned", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, u.full_name AS customer_name, u.phone AS customer_phone
       FROM rides r JOIN users u ON u.id = r.customer_id
       WHERE r.agent_id = $1 ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong loading your rides" });
  }
});

// ---------- ACCEPT RIDE (agent) — row-locked the same way delivery accept
// is, so two agents racing to accept the same ride can't both succeed. ----------
router.post("/:id/accept", requireAuth, requireRole("agent"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows: profileRows } = await client.query("SELECT * FROM agent_profiles WHERE user_id = $1", [req.user.id]);
    const profile = profileRows[0];
    if (!profile || profile.approval_status !== "approved" || profile.vehicle_type !== "cab") {
      return res.status(403).json({ error: "Only approved cab agents can accept rides" });
    }

    await client.query("BEGIN");
    const { rows: rideRows } = await client.query("SELECT * FROM rides WHERE id = $1 FOR UPDATE", [req.params.id]);
    const ride = rideRows[0];
    if (!ride) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Ride not found" });
    }
    if (ride.payment_status !== "paid") {
      await client.query("ROLLBACK");
      return res.status(402).json({ error: "This ride hasn't been paid for yet" });
    }
    if (ride.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This ride has already been accepted by another agent" });
    }

    await client.query(
      `UPDATE rides SET status = 'accepted', agent_id = $1, accepted_at = now() WHERE id = $2`,
      [req.user.id, ride.id]
    );
    await client.query("COMMIT");

    const { rows: updated } = await pool.query("SELECT * FROM rides WHERE id = $1", [ride.id]);
    notifyRideCustomer(updated[0], "accepted"); // fire-and-forget
    res.json(updated[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Something went wrong accepting this ride" });
  } finally {
    client.release();
  }
});

// ---------- ADVANCE STATUS (agent, own ride only) ----------
const NEXT_STATUS = {
  accepted: "in_progress", // driver has picked the rider up, trip is underway
  in_progress: "completed",
};

router.patch("/:id/advance", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM rides WHERE id = $1", [req.params.id]);
    const ride = rows[0];
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.agent_id !== req.user.id) return res.status(403).json({ error: "Not your ride" });

    const next = NEXT_STATUS[ride.status];
    if (!next) return res.status(409).json({ error: `Cannot advance a ride from status '${ride.status}'` });

    const timestampCol = next === "in_progress" ? "started_at" : next === "completed" ? "completed_at" : null;
    if (timestampCol) {
      await pool.query(`UPDATE rides SET status = $1, ${timestampCol} = now() WHERE id = $2`, [next, ride.id]);
    } else {
      await pool.query(`UPDATE rides SET status = $1 WHERE id = $2`, [next, ride.id]);
    }

    if (next === "completed") {
      // Same 80% cut agents get on delivered parcels — kept consistent
      // rather than inventing a different split for rides. total_rides is
      // its own counter, separate from total_deliveries, since a ride
      // isn't a delivery even though the same agent can do both.
      await pool.query(
        `UPDATE agent_profiles SET wallet_balance = wallet_balance + $1, total_rides = total_rides + 1 WHERE user_id = $2`,
        [ride.price * 0.8, req.user.id]
      );
    }

    const { rows: updated } = await pool.query("SELECT * FROM rides WHERE id = $1", [ride.id]);
    notifyRideCustomer(updated[0], next); // fire-and-forget — "in_progress" or "completed"
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating this ride" });
  }
});

// ---------- LIVE LOCATION DURING AN ACTIVE RIDE (agent, own ride only) ----------
const ACTIVE_STATUSES = ["accepted", "in_progress"];

router.patch("/:id/location", requireAuth, requireRole("agent"), async (req, res) => {
  try {
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "Invalid coordinates" });
    }

    const { rows } = await pool.query("SELECT * FROM rides WHERE id = $1", [req.params.id]);
    const ride = rows[0];
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.agent_id !== req.user.id) return res.status(403).json({ error: "Not your ride" });
    if (!ACTIVE_STATUSES.includes(ride.status)) {
      return res.status(409).json({ error: "Location can only be shared on an active ride" });
    }

    await pool.query(
      "UPDATE rides SET current_lat = $1, current_lng = $2, location_updated_at = now() WHERE id = $3",
      [lat, lng, ride.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating location" });
  }
});

module.exports = router;
