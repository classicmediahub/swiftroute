const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getRideQuote } = require("../quote");
const { priceForRideMeter } = require("../pricing");
const { initializeTransaction, verifyTransaction } = require("../paystack");
const { notifyRideCustomer } = require("../notify");
const { priceForLiveRide, finalizeLiveFare } = require("../pricing");

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

// Same formula as public.js's nearby-drivers endpoint — kept as its own
// copy here rather than a shared import, since this file has no existing
// dependency on public.js and one small function isn't worth wiring a
// cross-route import for.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const MAX_RIDE_MATCH_RADIUS_KM = 15; // starting number, tune freely — same spirit as pricing.js's other constants

// Pays the driver their 80% cut once a ride is actually paid for — call
// site moved from "trip completed" to "payment confirmed" now that those
// two events can happen minutes apart (wallet payments) or after a
// Paystack redirect round-trip (card payments). Takes a client so it can
// run inside the same transaction as the payment write it's paired with.
async function creditAgentForRide(client, ride) {
  if (!ride.agent_id) return;
  const amount = ride.final_price ?? ride.price;
  await client.query(
    `UPDATE agent_profiles SET wallet_balance = wallet_balance + $1, total_rides = total_rides + 1 WHERE user_id = $2`,
    [amount * 0.8, ride.agent_id]
  );
}

// The live fare for an in-progress or just-finished trip. Server-computed
// from data the client can't fake: elapsed wall-clock time since
// started_at, and distance_traveled_km, which only ever grows via
// authenticated GPS pings from the assigned agent (see /:id/location
// below) — never from anything the rider's or driver's client sends
// directly as a number.
function currentMeterFare(ride) {
  if (ride.status === "completed" && ride.final_price != null) {
    return {
      price: ride.final_price,
      distanceKm: ride.distance_traveled_km,
      elapsedMinutes: ride.started_at && ride.completed_at
        ? (new Date(ride.completed_at) - new Date(ride.started_at)) / 60000
        : null,
      final: true,
    };
  }
  if (ride.status !== "in_progress" || !ride.started_at) {
    return { price: null, distanceKm: ride.distance_traveled_km || 0, elapsedMinutes: 0, final: false };
  }
  const elapsedMinutes = (Date.now() - new Date(ride.started_at).getTime()) / 60000;
  const price = priceForRideMeter({ distanceKm: ride.distance_traveled_km || 0, elapsedMinutes });
  return { price, distanceKm: ride.distance_traveled_km || 0, elapsedMinutes, final: false };
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

// ---------- REQUEST A RIDE (customer) — creates the ride unpaid, with NO
// payment step at all. This is the Bolt-style change: nothing is charged
// at booking. `price` is seeded to the pre-ride estimate just so the ride
// has a sane number to show before the meter starts running; the moment
// the driver taps "Start trip", price gets reset to the base fare and
// begins climbing for real (see /:id/advance and /:id/location below).
// `estimated_price` keeps the original quote around for reference even
// after price starts changing. ----------
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
    await pool.query(
      `INSERT INTO rides (
        id, customer_id, pickup_address, pickup_lat, pickup_lng,
        dropoff_address, dropoff_lat, dropoff_lng, price, estimated_price, distance_km,
        payment_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,'unpaid')`,
      [id, req.user.id, pickup_address, pickup_coords.lat, pickup_coords.lng,
       dropoff_address, dropoff_coords.lat, dropoff_coords.lng, quote.price, quote.distanceKm]
    );

    const { rows } = await pool.query("SELECT * FROM rides WHERE id = $1", [id]);
    res.status(201).json({ ride: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong requesting the ride" });
  }
});

// ---------- PAY FOR A COMPLETED RIDE (customer) — this replaces the old
// pay-at-booking flow. Only callable once the trip has actually ended, and
// charges ride.price, which by then is the FINAL metered fare (frozen by
// /:id/advance when the driver ended the trip) — never the earlier
// estimate. Wallet pays instantly and credits the driver in the same
// transaction; Paystack hands back a checkout link and the driver is
// credited later, when /verify/:reference confirms success — exactly the
// same wallet/Paystack split the old booking-time payment used to do. ----------
router.post("/:id/charge", requireAuth, requireRole("customer"), async (req, res) => {
  try {
    const { payment_method } = req.body;
    const { rows } = await pool.query("SELECT * FROM rides WHERE id = $1", [req.params.id]);
    const ride = rows[0];
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.customer_id !== req.user.id) return res.status(403).json({ error: "Not your ride" });
    if (ride.status !== "completed") return res.status(409).json({ error: "This ride hasn't ended yet" });
    if (ride.payment_status === "paid") return res.status(409).json({ error: "This ride is already paid for" });

    if (payment_method === "wallet") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: userRows } = await client.query("SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE", [req.user.id]);
        const balance = userRows[0]?.wallet_balance ?? 0;
        if (balance < ride.price) {
          await client.query("ROLLBACK");
          return res.status(402).json({ error: `Insufficient wallet balance. You have ₦${balance.toLocaleString()}, this trip costs ₦${ride.price.toLocaleString()}.` });
        }

        const newBalance = balance - ride.price;
        await client.query("UPDATE users SET wallet_balance = $1 WHERE id = $2", [newBalance, req.user.id]);
        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, ride_id, note)
           VALUES ($1,$2,'ride_payment',$3,$4,'success',$5,$6)`,
          [uuidv4(), req.user.id, -ride.price, newBalance, ride.id, "Ride payment"]
        );
        await client.query("UPDATE rides SET payment_status = 'paid', payment_method = 'wallet' WHERE id = $1", [ride.id]);
        if (ride.agent_id) {
          await client.query(
            `UPDATE agent_profiles SET wallet_balance = wallet_balance + $1, total_rides = total_rides + 1 WHERE user_id = $2`,
            [ride.price * 0.8, ride.agent_id]
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      const { rows: updated } = await pool.query("SELECT * FROM rides WHERE id = $1", [ride.id]);
      return res.json({ ride: updated[0], authorization_url: null });
    }

    // Default: pay via Paystack checkout for the final metered amount.
    const reference = paymentReference();
    await pool.query("UPDATE rides SET paystack_reference = $1, payment_method = 'paystack' WHERE id = $2", [reference, ride.id]);

    let authorization_url;
    try {
      const paystackData = await initializeTransaction({
        email: req.user.email,
        amountNaira: ride.price,
        reference,
        callback_url: callbackUrl(),
        metadata: { ride_id: ride.id },
      });
      authorization_url = paystackData.authorization_url;
    } catch (err) {
      console.error("Paystack initialize failed for ride:", err.message);
      return res.status(502).json({ error: "We couldn't start payment right now. Try again from My rides." });
    }

    res.json({ authorization_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong starting payment" });
  }
});

// ---------- VERIFY PAYMENT (customer) — called by the frontend when
// Paystack redirects back after checkout. Now also credits the driver on
// success, since that used to happen when the trip ended but now can only
// happen once the customer has actually paid. ----------
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
      if (ride.agent_id) {
        // Same 80% cut agents get everywhere else in this codebase — only
        // applied here, once, since payment_status was 'unpaid' a moment
        // ago and is only flipping to 'paid' right now in this request.
        await pool.query(
          `UPDATE agent_profiles SET wallet_balance = wallet_balance + $1, total_rides = total_rides + 1 WHERE user_id = $2`,
          [ride.price * 0.8, ride.agent_id]
        );
      }
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

    await pool.query("UPDATE rides SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2 WHERE id = $1", [ride.id, req.user.id]);
    // Still no auto-refund for a CUSTOMER-initiated cancellation — a
    // deliberate choice, not an oversight: refund-on-buyer's-remorse is a
    // business policy decision, not something to default to silently. A
    // paid ride still needs a real Paystack refund (or a manual wallet
    // credit) processed separately for now. Contrast with agent-initiated
    // cancellation just below, which DOES auto-refund — that one is
    // unambiguously not the customer's fault.

    const { rows: updated } = await pool.query("SELECT * FROM rides WHERE id = $1", [ride.id]);
    notifyRideCustomer(updated[0], "cancelled"); // fire-and-forget
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong cancelling this ride" });
  }
});

// ---------- AGENT-INITIATED CANCEL — didn't exist before; an agent who
// accepted a ride had no way to back out (breakdown, emergency, etc.)
// other than just leaving the customer stranded indefinitely. Only
// allowed from 'accepted' (before the trip is actually underway) — once
// 'in_progress', backing out mid-trip is a different, messier situation
// this endpoint doesn't try to handle. Auto-refunds the fare to the
// customer's wallet if it was paid — regardless of whether they
// originally paid by wallet or Paystack, crediting wallet instead of a
// real Paystack reversal (same pattern already used for pool rebalancing
// and guarantee-window penalties elsewhere in this codebase), since this
// is unambiguously not the customer's fault. ----------
router.patch("/:id/agent-cancel", requireAuth, requireRole("agent"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM rides WHERE id = $1 FOR UPDATE", [req.params.id]);
    const ride = rows[0];
    if (!ride) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Ride not found" }); }
    if (ride.agent_id !== req.user.id) { await client.query("ROLLBACK"); return res.status(403).json({ error: "Not your ride" }); }
    if (ride.status !== "accepted") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Can only cancel a ride that's accepted but not yet started" });
    }

    await client.query(
      "UPDATE rides SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2 WHERE id = $1",
      [ride.id, req.user.id]
    );

    // Note: under the new post-trip payment model, payment_status is
    // always 'unpaid' at this point — cancellation is only allowed while
    // 'accepted' (before the trip starts), and nothing is ever charged
    // before then. This branch is kept as a defensive no-op rather than
    // removed, in case that invariant ever changes.
    if (ride.payment_status === "paid") {
      const { rows: walletRows } = await client.query(
        "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance",
        [ride.price, ride.customer_id]
      );
      await client.query(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_after, status, ride_id, note)
         VALUES ($1,$2,'refund',$3,$4,'success',$5,$6)`,
        [uuidv4(), ride.customer_id, ride.price, walletRows[0].wallet_balance, ride.id, "Ride cancelled by driver \u2014 full refund"]
      );
    }

    await client.query("COMMIT");
    const { rows: updated } = await pool.query("SELECT * FROM rides WHERE id = $1", [ride.id]);
    notifyRideCustomer(updated[0], "cancelled"); // fire-and-forget
    res.json(updated[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Something went wrong cancelling this ride" });
  } finally {
    client.release();
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

    // No payment_status filter anymore — rides are unpaid at this stage by
    // design now, payment happens after the trip ends (see /:id/charge).
    const { rows } = await pool.query(
      `SELECT r.*, u.full_name AS customer_name, u.phone AS customer_phone
       FROM rides r JOIN users u ON u.id = r.customer_id
       WHERE r.status = 'pending'
       ORDER BY r.created_at ASC`
    );

    // Proximity filter — previously every approved cab agent saw every
    // pending ride nationwide, with no distance shown and no way to tell
    // a Lagos ride from one in Kano apart from reading the address text.
    // Falls back to showing everything unfiltered if this agent has never
    // broadcast a location yet, rather than hiding all rides from someone
    // brand new who just hasn't gone online yet.
    if (profile.current_lat == null || profile.current_lng == null) {
      return res.json(rows.map((r) => ({ ...r, distance_from_you_km: null })));
    }
    const withDistance = rows
      .map((r) => ({ ...r, distance_from_you_km: Math.round(haversineKm(profile.current_lat, profile.current_lng, r.pickup_lat, r.pickup_lng) * 10) / 10 }))
      .filter((r) => r.distance_from_you_km <= MAX_RIDE_MATCH_RADIUS_KM)
      .sort((a, b) => a.distance_from_you_km - b.distance_from_you_km);
    res.json(withDistance);
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

    // A cab agent can't physically be doing two rides at once — this
    // didn't exist before, so nothing stopped an agent from accepting a
    // second ride before finishing their first.
    const { rows: activeRows } = await client.query(
      "SELECT id FROM rides WHERE agent_id = $1 AND status IN ('accepted','in_progress')",
      [req.user.id]
    );
    if (activeRows.length > 0) {
      return res.status(409).json({ error: "You already have an active ride — complete or cancel it before accepting another." });
    }

    await client.query("BEGIN");
    const { rows: rideRows } = await client.query("SELECT * FROM rides WHERE id = $1 FOR UPDATE", [req.params.id]);
    const ride = rideRows[0];
    if (!ride) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Ride not found" });
    }
    // No payment gate here anymore — rides are unpaid all the way through
    // the trip now, and only get paid for once they're done (see
    // /:id/charge). Accepting an unpaid ride is expected, not an error.
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

    if (next === "in_progress") {
      // Starting the meter: reset price to the flag-fall base fare and
      // zero the distance counter, and seed meter_last_lat/lng from the
      // pickup point so the very first GPS ping (see /:id/location) has
      // something to measure a segment against instead of comparing to
      // null. This is the moment "the money starts reading."
      await pool.query(
        `UPDATE rides
         SET status = 'in_progress', started_at = now(), meter_distance_km = 0,
             meter_last_lat = pickup_lat, meter_last_lng = pickup_lng
         WHERE id = $1`,
        [ride.id]
      );
    } else if (next === "completed") {
      // Ending the meter: one last recompute using the FULL elapsed time
      // (from started_at to right now) and the FULL accumulated distance,
      // then freeze that as the final price agent + customer both see.
      // This is deliberately independent of whatever the last GPS ping
      // happened to compute — a ping might be up to ~8s stale, but
      // completed_at is exact, so the final number reflects the true
      // trip duration down to the second rather than the last poll.
      const elapsedMin = ride.started_at ? (Date.now() - new Date(ride.started_at).getTime()) / 60000 : 0;
      const rawFare = priceForLiveRide({ distanceKm: ride.meter_distance_km || 0, durationMin: elapsedMin });
      const finalPrice = finalizeLiveFare(rawFare);
      await pool.query(
        `UPDATE rides SET status = 'completed', completed_at = now(), price = $1 WHERE id = $2`,
        [finalPrice, ride.id]
      );
      // Driver is NOT credited here anymore — that only happens once the
      // customer actually pays (see /:id/charge and /verify/:reference),
      // since a completed trip's fare is now owed, not already collected.
    } else {
      await pool.query(`UPDATE rides SET status = $1 WHERE id = $2`, [next, ride.id]);
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

    // While heading to pickup ('accepted'), just track position — the
    // meter isn't running yet, only starts once the trip is in_progress
    // (see /:id/advance). Once it is, add the distance from the last known
    // point to this one onto the running total.
    let meterDistanceKm = ride.meter_distance_km || 0;
    let livePrice = ride.price;
    let elapsedMin = 0;

    if (ride.status === "in_progress") {
      if (ride.meter_last_lat != null && ride.meter_last_lng != null) {
        const segmentKm = haversineKm(ride.meter_last_lat, ride.meter_last_lng, lat, lng);
        // Guard against GPS noise/jumps: a phone briefly losing signal and
        // reacquiring can report a multi-km "jump" that never actually
        // happened. Pings arrive every ~8s (see useRideLocation.js), so
        // anything over 1km in one hop is almost certainly bad data, not a
        // real 450+ km/h trip — skip adding it rather than overcharging.
        if (Number.isFinite(segmentKm) && segmentKm > 0 && segmentKm < 1) {
          meterDistanceKm += segmentKm;
        }
      }
      elapsedMin = ride.started_at ? (Date.now() - new Date(ride.started_at).getTime()) / 60000 : 0;
      livePrice = priceForLiveRide({ distanceKm: meterDistanceKm, durationMin: elapsedMin });

      await pool.query(
        `UPDATE rides
         SET current_lat = $1, current_lng = $2, location_updated_at = now(),
             meter_last_lat = $1, meter_last_lng = $2, meter_distance_km = $3, price = $4
         WHERE id = $5`,
        [lat, lng, meterDistanceKm, livePrice, ride.id]
      );
    } else {
      await pool.query(
        "UPDATE rides SET current_lat = $1, current_lng = $2, location_updated_at = now() WHERE id = $3",
        [lat, lng, ride.id]
      );
    }

    res.json({ success: true, price: livePrice, distanceKm: Math.round(meterDistanceKm * 10) / 10, elapsedMinutes: Math.round(elapsedMin * 10) / 10 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong updating location" });
  }
});

// ---------- LIVE METER (customer or agent, own ride only) — polled by the
// frontend (RideMeter.jsx) roughly every few seconds while a trip is
// in_progress, and once more after completion to show the frozen final
// number. Kept as its own lightweight endpoint rather than making the
// rider poll the full /mine list, so the ticking number doesn't depend on
// re-fetching every other ride too. ----------
router.get("/:id/meter", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM rides WHERE id = $1", [req.params.id]);
    const ride = rows[0];
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.customer_id !== req.user.id && ride.agent_id !== req.user.id) {
      return res.status(403).json({ error: "Not your ride" });
    }

    if (ride.status === "completed") {
      const elapsedMin = ride.started_at && ride.completed_at
        ? (new Date(ride.completed_at).getTime() - new Date(ride.started_at).getTime()) / 60000
        : 0;
      return res.json({
        price: ride.price,
        distanceKm: Math.round((ride.meter_distance_km || 0) * 10) / 10,
        elapsedMinutes: Math.round(elapsedMin * 10) / 10,
        final: true,
      });
    }

    if (ride.status !== "in_progress") {
      return res.json({ price: null, distanceKm: null, elapsedMinutes: null, final: false });
    }

    const elapsedMin = ride.started_at ? (Date.now() - new Date(ride.started_at).getTime()) / 60000 : 0;
    res.json({
      price: ride.price,
      distanceKm: Math.round((ride.meter_distance_km || 0) * 10) / 10,
      elapsedMinutes: Math.round(elapsedMin * 10) / 10,
      final: false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong reading the meter" });
  }
});

module.exports = router;
