const FACEPP_API_KEY = process.env.FACEPP_API_KEY;
const FACEPP_API_SECRET = process.env.FACEPP_API_SECRET;
const FACEPP_COMPARE_URL = "https://api-us.faceplusplus.com/facepp/v3/compare";

// Face++ recommends 70-80 for standard app-login-style authentication
// (vs 80+ for high-security scenarios like financial transactions). We use
// the stricter end of that range since this gates who can pick up and
// handle someone else's delivery.
const MATCH_THRESHOLD = 78;

function stripDataUrlPrefix(dataUrl) {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl || "");
  return match ? match[1] : dataUrl;
}

// Compares two face photos (base64 data URLs). Returns { matched, confidence }.
// Throws if the provider isn't configured or the request itself fails —
// callers must decide how to handle that (this is a security gate, so
// "fail open" is never the right default here).
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
    // Face++ returns errors like "INVALID_IMAGE" or "NO_FACE_FOUND" for
    // unusable photos — surface these directly so the UI can explain what
    // went wrong instead of a generic failure.
    throw new Error(data.error_message);
  }

  const confidence = data.confidence ?? 0;
  return { matched: confidence >= MATCH_THRESHOLD, confidence };
}

module.exports = { compareFaces, MATCH_THRESHOLD };
