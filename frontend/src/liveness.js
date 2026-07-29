// Shared liveness logic — pure functions, no React, so LivenessCheck.jsx
// stays focused on UI. Thresholds here MUST match backend/face.js's
// checkLiveness() — this copy is only for instant on-screen feedback before
// submit; the server independently re-decides pass/fail from the same
// `samples` array, and its verdict is the one that actually matters.

export const SAMPLE_COUNT = 14;
export const SAMPLE_INTERVAL_MS = 180; // ~2.5s total capture

const BLINK_EAR_DROP = 0.08;
const TURN_YAW_DELTA = 12;
const MIN_DETECTED_RATIO = 0.7;
const STATIC_EAR_RANGE = 0.02;
const STATIC_YAW_RANGE = 2;

export function pickChallenge() {
  return Math.random() < 0.5 ? "blink" : "turn";
}

// EAR = (dist(p2,p6) + dist(p3,p5)) / (2 * dist(p1,p4)) — Soukupová & Čech.
// face-api.js's getLeftEye()/getRightEye() return points in matching order.
function eyeAspectRatio(eyePoints) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const vertical1 = dist(eyePoints[1], eyePoints[5]);
  const vertical2 = dist(eyePoints[2], eyePoints[4]);
  const horizontal = dist(eyePoints[0], eyePoints[3]);
  return horizontal === 0 ? 0 : (vertical1 + vertical2) / (2 * horizontal);
}

// Unitless left/right asymmetry score, not a real degree value — see
// backend/face.js's comment on TURN_YAW_DELTA for why that's fine as long
// as both sides use the same formula (they do).
function yawScore(landmarks) {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const nose = landmarks.getNose();
  const avg = (pts) => ({
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  });
  const leftCenter = avg(leftEye);
  const rightCenter = avg(rightEye);
  const noseTip = nose[3] || nose[Math.floor(nose.length / 2)];
  const eyeMidX = (leftCenter.x + rightCenter.x) / 2;
  const eyeDist = Math.hypot(leftCenter.x - rightCenter.x, leftCenter.y - rightCenter.y);
  return eyeDist === 0 ? 0 : ((noseTip.x - eyeMidX) / eyeDist) * 100;
}

export async function analyzeFrame(faceapi, videoEl, detectorOptions) {
  const detection = await faceapi.detectSingleFace(videoEl, detectorOptions).withFaceLandmarks(true);
  if (!detection) {
    return { sample: { t: Date.now(), faceDetected: false, leftEAR: 0, rightEAR: 0, yaw: 0 }, detectionScore: 0 };
  }
  const leftEAR = eyeAspectRatio(detection.landmarks.getLeftEye());
  const rightEAR = eyeAspectRatio(detection.landmarks.getRightEye());
  const yaw = yawScore(detection.landmarks);
  return {
    sample: { t: Date.now(), faceDetected: true, leftEAR, rightEAR, yaw },
    detectionScore: detection.detection.score,
    avgEAR: (leftEAR + rightEAR) / 2,
  };
}

// Same decision logic as backend/face.js's checkLiveness(), kept in sync by
// hand — if you tune one, tune the other.
export function checkLivenessClientSide({ challenge, samples }) {
  if (!Array.isArray(samples) || samples.length < 8) {
    return { live: false, reason: "Not enough camera samples captured — please try again" };
  }
  const detected = samples.filter((s) => s.faceDetected);
  if (detected.length / samples.length < MIN_DETECTED_RATIO) {
    return { live: false, reason: "Couldn't see your face clearly through the whole check — try better lighting" };
  }
  const earValues = detected.map((s) => (s.leftEAR + s.rightEAR) / 2);
  const yawValues = detected.map((s) => s.yaw);
  const earRange = Math.max(...earValues) - Math.min(...earValues);
  const yawRange = Math.max(...yawValues) - Math.min(...yawValues);

  if (earRange < STATIC_EAR_RANGE && yawRange < STATIC_YAW_RANGE) {
    return { live: false, reason: "No movement detected — please try again" };
  }
  if (challenge === "blink") {
    if (Math.max(...earValues) - Math.min(...earValues) < BLINK_EAR_DROP) {
      return { live: false, reason: "We didn't catch a blink — try again and blink naturally" };
    }
  } else if (yawRange < TURN_YAW_DELTA) {
    return { live: false, reason: "We didn't catch a head turn — try again" };
  }
  return { live: true, reason: null };
}
