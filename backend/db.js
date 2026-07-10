const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const DB_PATH = path.join(__dirname, "swiftroute.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`PRAGMA foreign_keys = ON;`);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('customer','agent','admin')),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS agent_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vehicle_type TEXT NOT NULL CHECK(vehicle_type IN ('self','bike','cab')),
  vehicle_make TEXT,
  vehicle_plate TEXT,
  license_number TEXT,
  city TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK(approval_status IN ('pending','approved','rejected','suspended')),
  is_online INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 5.0,
  total_deliveries INTEGER NOT NULL DEFAULT 0,
  wallet_balance REAL NOT NULL DEFAULT 0
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES users(id),
  agent_id TEXT REFERENCES users(id),
  package_type TEXT NOT NULL,
  package_note TEXT,
  pickup_address TEXT NOT NULL,
  pickup_city TEXT NOT NULL,
  dropoff_address TEXT NOT NULL,
  dropoff_city TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  preferred_vehicle TEXT NOT NULL DEFAULT 'any' CHECK(preferred_vehicle IN ('any','self','bike','cab')),
  price REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','picked_up','in_transit','delivered','cancelled')),
  tracking_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  picked_up_at TEXT,
  delivered_at TEXT,
  cancelled_at TEXT
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS delivery_events (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

module.exports = db;
