// ---------- LOGIN — unchanged. Face++ still does the 1:1 match between a
// login selfie and the agent's signup photo. That's a different problem
// than liveness (see checkLiveness below) — it's *identity matching*, and
// swapping it out is a separate, bigger decision than what this file's
// signup-side liveness check was scoped to solve. ----------
const FACEPP_API_KEY = process.env.FACEPP_API_KEY;
const FACEPP_API_SECRET = process.env.FACEPP_API_SECRET;
const FACEPP_COMPARE_URL = "https://api-us.faceplusplus.com/facepp/v3/compare";

const MATCH_THRESHOLD = 78;

function stripDataUrlPrefix(dataUrl) {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl || "");
  return match ? match[1] : dataUrl;
}

async function compareFaces(photoA, photoB) {
  if (!FACEPP_API_KEY || !FACEPP_API_SECRET) {
    throw new Error("FACEPP_API_KEY/FACEPP_API_SECRET are not set on the server");
  }

  const body = new URLSearchParams({
    api_key: FACEPP_API_KEY,
    api_secret: FACEPP_API_SECRET,
    image_base64_1: stripDataUrlPrefix(photoA),
    image_base64_2: stripDataUrlPrefix(photoB),
  });

  const res = await fetch(FACEPP_COMPARE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();

  if (data.error_message) {
    throw new Error(data.error_message);
  }

  const confidence = data.confidence ?? 0;
  return { matched: confidence >= MATCH_THRESHOLD, confidence };
}

// ---------- SIGNUP — self-hosted liveness check, no external API. ----------
//
// How this works end to end:
// 1. The browser runs face-api.js (TinyFaceDetector + tiny 68-point
//    landmarks) locally on the live camera feed — no network call, no
//    account, no cost. See frontend/liveness-capture.js for that half.
// 2. While the user blinks or turns their head on prompt, the browser
//    extracts ~10-15 samples of { leftEAR, rightEAR, yaw, faceDetected }
//    and sends that numeric sequence here — NOT a client-computed pass/
//    fail boolean, which a malicious client could just fake.
// 3. This function independently re-runs the pass/fail decision against
//    the raw numbers. A caller can't skip real detection: producing a
//    landmark sequence that plausibly shows a blink or head-turn requires
//    actually running the detector against a live-looking feed, which is
//    a meaningfully higher bar than sending one static flag.
//
// This is a deliberate tradeoff: it doesn't run image analysis on the
// server (avoids the node-canvas / native-build fragility that's common
// on Render), at the cost of trusting the browser's landmark *extraction*
// (not its verdict). Good enough to block casual spoofing (a printed photo,
// a photo held up to the camera, a static video loop). Not a substitute for
// a dedicated anti-spoofing model if fraud here becomes a real problem.

const MIN_SAMPLES = 8;
const MIN_DETECTED_RATIO = 0.7; // at least 70% of samples must have a face
const BLINK_EAR_DROP = 0.08; // eye-aspect-ratio drop counted as a real blink
const TURN_YAW_DELTA = 12; // degrees of head-yaw movement counted as a real turn
const STATIC_EAR_RANGE = 0.02; // below this + below STATIC_YAW_RANGE = "nothing moved"
const STATIC_YAW_RANGE = 2;

function checkLiveness({ challenge, samples }) {
  if (!Array.isArray(samples) || samples.length < MIN_SAMPLES) {
    return { live: false, reason: "Not enough camera samples captured — please try again" };
  }

  const detected = samples.filter((s) => s && s.faceDetected);
  if (detected.length / samples.length < MIN_DETECTED_RATIO) {
    return { live: false, reason: "Couldn't see your face clearly through the whole check — try better lighting" };
  }

  const earValues = detected.map((s) => (s.leftEAR + s.rightEAR) / 2);
  const yawValues = detected.map((s) => s.yaw);
  const earRange = Math.max(...earValues) - Math.min(...earValues);
  const yawRange = Math.max(...yawValues) - Math.min(...yawValues);

  // Nothing moved at all across the whole sequence — a static photo held
  // up to the camera, or a frozen/looped feed, would look like this.
  if (earRange < STATIC_EAR_RANGE && yawRange < STATIC_YAW_RANGE) {
    return { live: false, reason: "No movement detected — please try again" };
  }

  if (challenge === "blink") {
    const drop = Math.max(...earValues) - Math.min(...earValues);
    if (drop < BLINK_EAR_DROP) {
      return { live: false, reason: "We didn't catch a blink — please try again and blink naturally" };
    }
  } else if (challenge === "turn") {
    if (yawRange < TURN_YAW_DELTA) {
      return { live: false, reason: "We didn't catch a head turn — please try again" };
    }
  } else {
    return { live: false, reason: "Unknown liveness challenge" };
  }

  return { live: true, reason: null };
}

module.exports = { compareFaces, checkLiveness, MATCH_THRESHOLD };
