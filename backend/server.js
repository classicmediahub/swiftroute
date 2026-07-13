require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { initSchema } = require("./db");

const authRoutes = require("./routes/auth");
const deliveryRoutes = require("./routes/deliveries");
const adminRoutes = require("./routes/admin");
const webhookRoutes = require("./routes/webhooks");
const publicRoutes = require("./routes/public");
const walletRoutes = require("./routes/wallet");

const app = express();

// In development this allows any origin. In production, set ALLOWED_ORIGIN
// to your Netlify URL (e.g. https://your-site.netlify.app) so only your
// frontend can call this API.
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));

// Paystack webhooks must be verified against the exact raw bytes of the
// request body, so this is mounted BEFORE express.json() parses anything.
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRoutes);

app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true, service: "PickAndEarn API" }));

app.use("/api/auth", authRoutes);
app.use("/api/deliveries", deliveryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/wallet", walletRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;

(async () => {
  try {
    await initSchema();
    app.listen(PORT, () => console.log(`PickAndEarn API running on http://localhost:${PORT}`));
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();
