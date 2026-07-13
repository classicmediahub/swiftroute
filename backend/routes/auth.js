const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function publicUser(u) {
  return {
    id: u.id, role: u.role, full_name: u.full_name, email: u.email, phone: u.phone, status: u.status,
    account_type: u.account_type, company_name: u.company_name,
  };
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

// ---------- AGENT SIGNUP ----------
router.post("/signup/agent", async (req, res) => {
  try {
    const {
      full_name, email, phone, password,
      vehicle_type, vehicle_make, vehicle_plate, license_number, city
    } = req.body;

    if (!full_name || !email || !phone || !password || !vehicle_type || !city) {
      return res.status(400).json({ error: "All required fields must be filled" });
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
      `INSERT INTO users (id, role, full_name, email, phone, password_hash) VALUES ($1, 'agent', $2, $3, $4, $5)`,
      [id, full_name, email.toLowerCase(), phone, hash]
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

// ---------- LOGIN (all roles) ----------
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

    let agent_profile = null;
    if (user.role === "agent") {
      const { rows: profileRows } = await pool.query("SELECT * FROM agent_profiles WHERE user_id = $1", [user.id]);
      agent_profile = profileRows[0] || null;
    }
    const token = signToken(user);
    res.json({ token, user: publicUser(user), agent_profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong logging in" });
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
