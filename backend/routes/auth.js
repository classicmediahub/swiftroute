const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");
const { compareFaces } = require("../face");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Short-lived token issued after an agent's password checks out, but before
// their live selfie has been matched against their signup photo. Can't be
// used to authenticate any real endpoint — only /login/verify-face accepts it.
function signPendingFaceToken(user) {
  return jwt.sign({ id: user.id, type: "pending_face" }, JWT_SECRET, { expiresIn: "5m" });
}

function publicUser(u) {
  return {
    id: u.id, role: u.role, full_name: u.full_name, email: u.email, phone: u.phone, status: u.status,
    account_type: u.account_type, company_name: u.company_name, profile_photo: u.profile_photo,
  };
}

function isLikelyPhoto(dataUrl) {
  return typeof dataUrl === "string" && /^data:image\/\w+;base64,/.test(dataUrl) && dataUrl.length > 1000;
}

// ---------- CUSTOMER SIGNUP ----------
router.post("/signup/customer", async (req, res) => {
  try {
    const { full_name, email, phone, password, is_business, company_name } = req.body;
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
    await pool.query(
      `INSERT INTO users (id, role, full_name, email, phone, password_hash, account_type, company_name)
       VALUES ($1, 'customer', $2, $3, $4, $5, $6, $7)`,
      [id, full_name, email.toLowerCase(), phone, hash, accountType, is_business ? company_name : null]
    );

    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    const user = rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong creating your account" });
  }
});

// ---------- AGENT SIGNUP — requires a live-captured face photo, which
// doubles as (1) the reference photo future logins are matched against,
// and (2) the profile picture customers see once this agent accepts a job ----------
router.post("/signup/agent", async (req, res) => {
  try {
    const {
      full_name, email, phone, password,
      vehicle_type, vehicle_make, vehicle_plate, license_number, city,
      profile_photo,
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

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length) return res.status(409).json({ error: "An account with this email already exists" });

    const id = uuidv4();
    const hash = bcrypt.hashSync(password, 10);

    await pool.query(
      `INSERT INTO users (id, role, full_name, email, phone, password_hash, profile_photo) VALUES ($1, 'agent', $2, $3, $4, $5, $6)`,
      [id, full_name, email.toLowerCase(), phone, hash, profile_photo]
    );

    await pool.query(
      `INSERT INTO agent_profiles (user_id, vehicle_type, vehicle_make, vehicle_plate, license_number, city)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, vehicle_type, vehicle_make || null, vehicle_plate || null, license_number || null, city]
    );

    const { rows: userRows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    const { rows: profileRows } = await pool.query("SELECT * FROM agent_profiles WHERE user_id = $1", [id]);

    const user = userRows[0];
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user), agent_profile: profileRows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong creating your account" });
  }
});

// ---------- ADMIN SIGNUP (requires invite code) ----------
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
    await pool.query(
      `INSERT INTO users (id, role, full_name, email, phone, password_hash) VALUES ($1, 'admin', $2, $3, $4, $5)`,
      [id, full_name, email.toLowerCase(), phone, hash]
    );

    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    const user = rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong creating your account" });
  }
});

// ---------- LOGIN — agents get a two-step flow: password first, then a
// live selfie matched against their signup photo. Customers and admins
// log in the normal single-step way. ----------
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
        // Shouldn't happen for anyone who signed up after this feature
        // shipped, but covers any pre-existing agent account gracefully
        // rather than locking them out with no path forward.
        return res.status(403).json({
          error: "Your account is missing a verification photo. Please contact support to add one before logging in.",
        });
      }
      const pendingToken = signPendingFaceToken(user);
      return res.json({ require_face_verification: true, pending_token: pendingToken });
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user), agent_profile: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong logging in" });
  }
});

// ---------- STEP 2 OF AGENT LOGIN — match a live selfie against the
// agent's signup photo via Face++. Only a valid, unexpired pending_face
// token can reach this; it can't be used for anything else. ----------
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

// ---------- CURRENT USER ----------
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
    res.json({ user: publicUser(user), agent_profile });
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

module.exports = router;
