const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");

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
  return { id: u.id, role: u.role, full_name: u.full_name, email: u.email, phone: u.phone, status: u.status };
}

// ---------- CUSTOMER SIGNUP ----------
router.post("/signup/customer", (req, res) => {
  const { full_name, email, phone, password } = req.body;
  if (!full_name || !email || !phone || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: "An account with this email already exists" });

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO users (id, role, full_name, email, phone, password_hash) VALUES (?, 'customer', ?, ?, ?, ?)`
  ).run(id, full_name, email.toLowerCase(), phone, hash);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

// ---------- AGENT SIGNUP ----------
router.post("/signup/agent", (req, res) => {
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
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: "An account with this email already exists" });

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO users (id, role, full_name, email, phone, password_hash) VALUES (?, 'agent', ?, ?, ?, ?)`
  ).run(id, full_name, email.toLowerCase(), phone, hash);

  db.prepare(
    `INSERT INTO agent_profiles (user_id, vehicle_type, vehicle_make, vehicle_plate, license_number, city)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, vehicle_type, vehicle_make || null, vehicle_plate || null, license_number || null, city);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  const profile = db.prepare("SELECT * FROM agent_profiles WHERE user_id = ?").get(id);
  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user), agent_profile: profile });
});

// ---------- ADMIN SIGNUP (requires invite code) ----------
router.post("/signup/admin", (req, res) => {
  const { full_name, email, phone, password, invite_code } = req.body;
  if (!full_name || !email || !phone || !password || !invite_code) {
    return res.status(400).json({ error: "All fields including invite code are required" });
  }
  if (invite_code !== process.env.ADMIN_INVITE_CODE) {
    return res.status(403).json({ error: "Invalid admin invite code" });
  }
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: "An account with this email already exists" });

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO users (id, role, full_name, email, phone, password_hash) VALUES (?, 'admin', ?, ?, ?, ?)`
  ).run(id, full_name, email.toLowerCase(), phone, hash);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

// ---------- LOGIN (all roles) ----------
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: "Invalid email or password" });
  if (user.status === "suspended") return res.status(403).json({ error: "Your account has been suspended" });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  let agent_profile = null;
  if (user.role === "agent") {
    agent_profile = db.prepare("SELECT * FROM agent_profiles WHERE user_id = ?").get(user.id);
  }
  const token = signToken(user);
  res.json({ token, user: publicUser(user), agent_profile });
});

// ---------- CURRENT USER ----------
router.get("/me", (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return res.status(401).json({ error: "No token" });
  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    let agent_profile = null;
    if (user.role === "agent") {
      agent_profile = db.prepare("SELECT * FROM agent_profiles WHERE user_id = ?").get(user.id);
    }
    res.json({ user: publicUser(user), agent_profile });
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

module.exports = router;
