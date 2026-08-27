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
const apiKeyRoutes = require("./routes/apikeys");
const v1Routes = require("./routes/v1");
const agentRoutes = require("./routes/agent");
const rideRoutes = require("./routes/rides");
const streakRoutes = require("./routes/streaks");
const reputationRoutes = require("./routes/reputation");
const whatsappRoutes = require("./routes/whatsapp");
const landmarkRoutes = require("./routes/landmarks");
const withdrawalRoutes = require("./routes/withdrawals");
const referralRoutes = require("./routes/referrals");
const messageRoutes = require("./routes/messages");
const sosRoutes = require("./routes/sos");

const app = express();

// In development this allows any origin. In production, set ALLOWED_ORIGIN
// to your Netlify URL (e.g. https://your-site.netlify.app) so only your
// frontend can call this API.
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : {}));

// Paystack webhooks must be verified against the exact raw bytes of the
// request body, so this is mounted BEFORE express.json() parses anything.
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRoutes);

// Default is 100KB, which a single base64-encoded photo blows past
// immediately — proof-of-delivery photos, agent profile photos, and
// liveness-check captures are all sent as base64 strings inside the JSON
// body (not multipart), so the limit has to accommodate an actual image,
// not just typical request payloads. 10MB comfortably covers a phone
// camera photo even after base64's ~33% size inflation, while still
// bounding worst-case request size.
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true, service: "PickAndEarn API" }));

app.use("/api/auth", authRoutes);
app.use("/api/deliveries", deliveryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/keys", apiKeyRoutes);
app.use("/api/v1", v1Routes);
app.use("/api/agent", agentRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/streaks", streakRoutes);
app.use("/api/agents", reputationRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/landmarks", landmarkRoutes);
app.use("/api/withdrawals", withdrawalRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/sos", sosRoutes);

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
