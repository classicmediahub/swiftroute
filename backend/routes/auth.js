const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { compareFaces, checkLiveness } = require("../face");
const { verifyNIN } = require("../nin");
const { sendEmail } = require("../notifications");
const { generateReferralCode, attachReferrer } = require("../referrals");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://www.pickandearn.com.ng";

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function signPendingFaceToken(user) {
  return jwt.sign({ id: user.id, type: "pending_face" }, JWT_SECRET, { expiresIn: "5m" });
}

function signEmailVerificationToken(user) {
  return jwt.sign({ id: user.id, type: "email_verify" }, JWT_SECRET, { expiresIn: "24h" });
}

function sendVerificationEmail(user) {
  const token = signEmailVerificationToken(user);
  const link = `${FRONTEND_URL}/verify-email?token=${token}`;
  sendEmail({
    to: user.email,
    subject: "Verify your email — PickAndEarn",
    html: `<p>Hi ${user.full_name},</p><p>Please confirm this is your email address by clicking the link below:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
  }).catch((err) => console.error("sendVerificationEmail failed:", err.message));
}

function publicUser(u) {
  return {
    id: u.id, role: u.role, full_name: u.full_name, email: u.email, phone: u.phone, status: u.status,
    account_type: u.account_type, company_name: u.company_name, profile_photo: u.profile_photo,
    email_verified: u.email_verified, referral_code: u.referral_code,
  };
}

function isLikelyPhoto(dataUrl) {
  return typeof dataUrl === "string" && /^data:image\/\w+;base64,/.test(dataUrl) && dataUrl.length > 1000;
}

// ---------- CUSTOMER SIGNUP ---------- (unchanged)
router.post("/signup/customer", async (req, res) => {
  try {
    const { full_name, email, phone, password, is_business, company_name, referral_code } = req.body;
    if (!full_name || !email || !phone || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    if (is_business && !company_name) {
      return res.status(400).json({ error: "Company name is required for a business account" });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: "An account with this email already exists" });

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    const accountType = is_business ? "business" : "individual";

    // referral_code is NOT NULL with no default (see db.js) — it has to
    // be part of THIS insert, not set afterward. An UPDATE after the fact
    // can never run, because the INSERT itself would already have failed
    // the NOT NULL check first. Retrying on collision here for the same
    // reason referrals.js's own helpers do.
    let insertedRow = false;
    for (let attempt = 0; attempt < 5 && !insertedRow; attempt++) {
      const code = generateReferralCode();
      try {
        await pool.query(
          `INSERT INTO users (id, role, full_name, email, phone, password_hash, account_type, company_name, referral_code)
           VALUES ($1, 'customer', $2, $3, $4, $5, $6, $7, $8)`,
          [id, full_name, email.toLowerCase(), phone, hash, accountType, is_business ? company_name : null, code]
        );
        insertedRow = true;
      } catch (err) {
        if (err.code === "23505" && attempt < 4) continue; // referral_code or email collision — retry with a fresh code
        throw err;
      }
    }
    await attachReferrer(id, referral_code); // link them to whoever referred them, if anyone (no-ops on missing/invalid code)

    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    const user = rows[0];
    sendVerificationEmail(user);
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong creating your account" });
  }
});

// ---------- AGENT SIGNUP — requires a live-captured face photo, a passed
// liveness challenge (new — replaces nothing, this is an added gate that
// didn't exist before), AND a well-formed NIN (format-only now, see nin.js
// for why). NIN and liveness are both checked BEFORE any account is
// created: a failure rejects the signup outright with a specific reason,
// it doesn't just get flagged for later review. Applies to every vehicle
// type (self, bike, cab) — not just riders. ----------
router.post("/signup/agent", async (req, res) => {
  try {
    const {
      full_name, email, phone, password,
      vehicle_type, vehicle_make, vehicle_plate, license_number, city,
      profile_photo, date_of_birth, nin,
      liveness_challenge, liveness_samples,
      referral_code,
    } = req.body;

    if (!full_name || !email || !phone || !password || !vehicle_type || !city) {
      return res.status(400).json({ error: "All required fields must be filled" });
    }
    if (!isLikelyPhoto(profile_photo)) {
      return res.status(400).json({ error: "A face photo is required to register as an agent" });
    }
    if (!["self", "bike", "cab"].includes(vehicle_type)) {
      return res.status(400).json({ error: "Vehicle type must be self, bike, or cab" });
    }
    if ((vehicle_type === "bike" || vehicle_type === "cab") && (!vehicle_plate || !license_number)) {
      return res.status(400).json({ error: "Plate number and license number are required for bike/cab agents" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    if (!date_of_birth || !nin) {
      return res.status(400).json({ error: "Date of birth and NIN are required for all agents" });
    }
    if (!/^\d{11}$/.test(nin)) {
      return res.status(400).json({ error: "NIN must be exactly 11 digits" });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: "An account with this email already exists" });

    // --- Liveness check, run before NIN/account creation like the other
    // hard gates. See face.js for how the pass/fail decision is made. ---
    const liveness = checkLiveness({ challenge: liveness_challenge, samples: liveness_samples });
    if (!liveness.live) {
      return res.status(400).json({ error: liveness.reason || "Liveness check failed — please try again" });
    }

    let ninResult;
    try {
      ninResult = await verifyNIN({ nin, firstName: full_name.split(" ")[0], lastName: full_name.split(" ").slice(-1)[0], dateOfBirth: date_of_birth });
    } catch (err) {
      console.error("NIN verification error:", err.message);
      return res.status(502).json({ error: "Couldn't verify your NIN right now. Please try again shortly." });
    }
    if (!ninResult.matched) {
      return res.status(400).json({ error: ninResult.reason || "NIN verification failed" });
    }

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);

    let insertedRow = false;
    for (let attempt = 0; attempt < 5 && !insertedRow; attempt++) {
      const code = generateReferralCode();
      try {
        await pool.query(
          `INSERT INTO users (id, role, full_name, email, phone, password_hash, profile_photo, referral_code)
           VALUES ($1, 'agent', $2, $3, $4, $5, $6, $7)`,
          [id, full_name, email.toLowerCase(), phone, hash, profile_photo, code]
        );
        insertedRow = true;
      } catch (err) {
        if (err.code === "23505" && attempt < 4) continue;
        throw err;
      }
    }

    await pool.query(
      `INSERT INTO agent_profiles
         (user_id, vehicle_type, vehicle_make, vehicle_plate, license_number, city, date_of_birth, nin,
          nin_verified, nin_verified_at, nin_verification_method,
          face_liveness_verified, face_liveness_verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, now(), $9, true, now())`,
      [id, vehicle_type, vehicle_make || null, vehicle_plate || null, license_number || null, city, date_of_birth, nin, ninResult.verificationMethod || "format_only"]
    );
    await attachReferrer(id, referral_code); // link them to whoever referred them, if anyone (no-ops on missing/invalid code)

    const { rows: userRows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    const { rows: profileRows } = await pool.query("SELECT * FROM agent_profiles WHERE user_id = $1", [id]);

    const user = userRows[0];
    sendVerificationEmail(user);
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user), agent_profile: profileRows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong creating your account" });
  }
});

// ---------- ADMIN SIGNUP (requires invite code) ---------- (unchanged)
router.post("/signup/admin", async (req, res) => {
  try {
    const { full_name, email, phone, password, invite_code } = req.body;
    if (!full_name || !email || !phone || !password || !invite_code) {
      return res.status(400).json({ error: "All fields including invite code are required" });
    }
    if (invite_code !== process.env.ADMIN_INVITE_CODE) {
      return res.status(403).json({ error: "Invalid admin invite code" });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: "An account with this email already exists" });

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    let insertedRow = false;
    for (let attempt = 0; attempt < 5 && !insertedRow; attempt++) {
      const code = generateReferralCode();
      try {
        await pool.query(
          `INSERT INTO users (id, role, full_name, email, phone, password_hash, referral_code) VALUES ($1, 'admin', $2, $3, $4, $5, $6)`,
          [id, full_name, email.toLowerCase(), phone, hash, code]
        );
        insertedRow = true;
      } catch (err) {
        if (err.code === "23505" && attempt < 4) continue;
        throw err;
      }
    }

    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    const user = rows[0];
    sendVerificationEmail(user);
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong creating your account" });
  }
});

// ---------- OUTLET SIGNUP — self-registers like an agent, but with none
// of the liveness/NIN identity checks (this verifies a BUSINESS, not a
// person physically presenting for work) and starts in the SAME kind of
// 'pending' approval gate as agent_profiles — see outlet_profiles in
// db.js. An outlet never appears in public browsing or can receive
// orders until an admin approves them (routes/outlets.js's /admin/*
// endpoints). ----------
router.post("/signup/outlet", async (req, res) => {
  try {
    const {
      full_name, email, phone, password,
      business_name, category, description, address, city, open_time, close_time,
      logo_photo, referral_code,
    } = req.body;

    if (!full_name || !email || !phone || !password || !business_name || !category || !address || !city) {
      return res.status(400).json({ error: "All required fields must be filled" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    if (!["restaurant", "eatery", "supermarket", "pharmacy", "other"].includes(category)) {
      return res.status(400).json({ error: "Invalid business category" });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: "An account with this email already exists" });

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);

    let insertedRow = false;
    for (let attempt = 0; attempt < 5 && !insertedRow; attempt++) {
      const code = generateReferralCode();
      try {
        await pool.query(
          `INSERT INTO users (id, role, full_name, email, phone, password_hash, referral_code)
           VALUES ($1, 'outlet', $2, $3, $4, $5, $6)`,
          [id, full_name, email.toLowerCase(), phone, hash, code]
        );
        insertedRow = true;
      } catch (err) {
        if (err.code === "23505" && attempt < 4) continue;
        throw err;
      }
    }

    await pool.query(
      `INSERT INTO outlet_profiles (user_id, business_name, category, description, address, city, open_time, close_time, logo_photo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, business_name, category, description || null, address, city, open_time || null, close_time || null, logo_photo || null]
    );
    await attachReferrer(id, referral_code); // metadata only for now — see routes/food.js, referral REWARDS are only paid on customer/agent roles today

    const { rows: userRows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    const { rows: profileRows } = await pool.query("SELECT * FROM outlet_profiles WHERE user_id = $1", [id]);

    const user = userRows[0];
    sendVerificationEmail(user);
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user), outlet_profile: profileRows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong creating your account" });
  }
});

// ---------- LOGIN ---------- (unchanged — agents still get the two-step
// password + Face++ selfie-match flow. See face.js top comment for why.)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Invalid email or password" });
    if (user.status === "suspended") return res.status(403).json({ error: "Your account has been suspended" });

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });

    if (user.role === "agent") {
      if (!user.profile_photo) {
        return res.status(403).json({
          error: "Your account is missing a verification photo. Please contact support to add one before logging in.",
        });
      }
      const pendingToken = signPendingFaceToken(user);
      return res.json({ require_face_verification: true, pending_token: pendingToken });
    }

    let outlet_profile = null;
    if (user.role === "outlet") {
      const { rows: profileRows } = await pool.query("SELECT * FROM outlet_profiles WHERE user_id = $1", [user.id]);
      outlet_profile = profileRows[0] || null;
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user), agent_profile: null, outlet_profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong logging in" });
  }
});

// ---------- STEP 2 OF AGENT LOGIN ---------- (unchanged — still Face++)
router.post("/login/verify-face", async (req, res) => {
  try {
    const { pending_token, selfie } = req.body;
    if (!pending_token || !isLikelyPhoto(selfie)) {
      return res.status(400).json({ error: "A live photo is required" });
    }

    let payload;
    try {
      payload = jwt.verify(pending_token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "This verification step has expired — please log in again" });
    }
    if (payload.type !== "pending_face") {
      return res.status(401).json({ error: "Invalid verification session" });
    }

    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [payload.id]);
    const user = rows[0];
    if (!user || user.role !== "agent" || !user.profile_photo) {
      return res.status(401).json({ error: "Invalid verification session" });
    }
    if (user.status === "suspended") return res.status(403).json({ error: "Your account has been suspended" });

    let result;
    try {
      result = await compareFaces(selfie, user.profile_photo);
    } catch (err) {
      console.error("Face comparison failed:", err.message);
      return res.status(502).json({ error: "Couldn't verify your face right now. Please try again." });
    }

    if (!result.matched) {
      return res.status(401).json({
        error: "That doesn't look like a match for this account's registered photo. Make sure you're in good lighting and facing the camera directly, then try again.",
      });
    }

    const { rows: profileRows } = await pool.query("SELECT * FROM agent_profiles WHERE user_id = $1", [user.id]);
    const token = signToken(user);
    res.json({ token, user: publicUser(user), agent_profile: profileRows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong verifying your face" });
  }
});

// ---------- EMAIL VERIFICATION ---------- (unchanged)
router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Verification token is required" });

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: "This verification link has expired or is invalid. Request a new one." });
    }
    if (payload.type !== "email_verify") {
      return res.status(400).json({ error: "Invalid verification link" });
    }

    const { rows } = await pool.query("UPDATE users SET email_verified = true WHERE id = $1 RETURNING id", [payload.id]);
    if (!rows.length) return res.status(404).json({ error: "Account not found" });

    res.json({ success: true, message: "Email verified successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong verifying your email" });
  }
});

// ---------- RESEND VERIFICATION EMAIL ---------- (unchanged)
router.post("/verify-email/resend", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    const user = rows[0];
    if (user && !user.email_verified) {
      sendVerificationEmail(user);
    }
    res.json({ success: true, message: "If that email has an account, a verification link has been sent." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ---------- CURRENT USER ---------- (unchanged)
router.get("/me", async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return res.status(401).json({ error: "No token" });
  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [payload.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    let agent_profile = null;
    if (user.role === "agent") {
      const { rows: profileRows } = await pool.query("SELECT * FROM agent_profiles WHERE user_id = $1", [user.id]);
      agent_profile = profileRows[0] || null;
    }
    let outlet_profile = null;
    if (user.role === "outlet") {
      const { rows: profileRows } = await pool.query("SELECT * FROM outlet_profiles WHERE user_id = $1", [user.id]);
      outlet_profile = profileRows[0] || null;
    }
    res.json({ user: publicUser(user), agent_profile, outlet_profile });
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

module.exports = router;
