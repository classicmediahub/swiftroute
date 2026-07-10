# SwiftRoute — Nigerian Delivery & Logistics Platform

A full-stack delivery marketplace with three account types:

- **Customers** — post a delivery (pickup, drop-off, recipient) and get an instant price.
- **Agents** — register as **Self**, **Bike**, or **Cab**, get approved by an admin, then see and accept nearby jobs.
- **Admins** — approve/suspend agents, suspend customers, and monitor every delivery on the platform.

## How the delivery flow works

1. A customer posts a delivery with pickup/drop-off addresses, recipient details, and a preferred vehicle type (or "any").
2. It appears in the **available jobs** list for approved agents whose vehicle type matches.
3. The first agent to accept it is locked in — no one else can take it (protected against race conditions).
4. The agent advances the job through **accepted → picked up → in transit → delivered**.
5. On delivery, the agent's wallet is credited (80% of the fare; SwiftRoute keeps 20%), and the customer sees the final status.
6. Every delivery has a tracking code (e.g. `SR-U3MNJ7J`) with a full event history.

## Project structure

```
logistics-app/
├── backend/     Node + Express API, SQLite database (no external DB needed)
└── frontend/    React + Vite + Tailwind CSS
```

## Running it locally

You need [Node.js](https://nodejs.org) v20+ installed (v22 recommended — the backend uses Node's built-in SQLite module, so there's nothing extra to install or configure).

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

This starts the API on **http://localhost:4000**. A `swiftroute.db` SQLite file is created automatically on first run — no setup needed.

The `.env` file already contains working defaults:
```
PORT=4000
JWT_SECRET=swiftroute_dev_secret_change_in_production_9f3a7c1e
ADMIN_INVITE_CODE=SWIFTROUTE-ADMIN-2026
```
**Change both `JWT_SECRET` and `ADMIN_INVITE_CODE` before putting this anywhere public.** The invite code is what stops random visitors from creating admin accounts — treat it like a password and only share it with people you want to have admin access.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

This starts the app on **http://localhost:5173**. It's already configured (via `frontend/.env`) to talk to the backend at `http://localhost:4000/api`.

### 3. Try it out

1. Open http://localhost:5173
2. Sign up as a **customer**, post a delivery.
3. In a private/incognito window, sign up as an **agent** (pick Bike, Cab, or Self).
4. Sign up as an **admin** using the invite code above, and approve the agent from the admin dashboard.
5. Back in the agent's window, refresh — the job now appears under "Available." Accept it and walk it through the delivery states.
6. Watch it update in the customer's dashboard.

## What's implemented

- Real signup/login for all three roles with hashed passwords (bcrypt) and JWT sessions.
- Agent registration with vehicle type (self/bike/cab) and vehicle/license details, held in "pending" until an admin approves.
- Delivery posting with live price estimate (based on same-city vs intercity, and vehicle type).
- Job marketplace: agents only see jobs matching their vehicle type; first-to-accept wins.
- Full delivery lifecycle with timestamps and an event log per delivery.
- Admin dashboard: platform stats, agent approval/suspension, customer suspension, full delivery ledger.
- Tracking codes with lookup by code.

## What you'd want to add before a real launch

- Real geolocation/maps (current pricing uses a simple city-based estimate, not live distance).
- Payments (Paystack/Flutterwave are the standard choices in Nigeria) instead of the current wallet-credit simulation.
- SMS/WhatsApp notifications to customers and agents on status changes.
- Push/live updates (currently the UI polls when you interact with it; a real-time layer like WebSockets would make tracking live).
- Document upload for agent verification (ID, license photo) rather than just typed-in numbers.
- Rate limiting and stronger production security review before going live.

## Tech stack

- **Backend:** Node.js, Express, Node's built-in `node:sqlite`, JWT, bcrypt
- **Frontend:** React 19, Vite, React Router, Tailwind CSS v4
