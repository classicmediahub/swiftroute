import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ComingSoon from "../pages/ComingSoon";

const BYPASS_STORAGE_KEY = "pae_launch_bypass";

// PLACEHOLDER — set as VITE_LAUNCH_DATE / VITE_LAUNCH_BYPASS_KEY env vars
// on Vercel. Both can be changed anytime without touching this code — just
// update the env var value and redeploy.
const LAUNCH_DATE = import.meta.env.VITE_LAUNCH_DATE;
const BYPASS_SECRET = import.meta.env.VITE_LAUNCH_BYPASS_KEY;

// Default-locked on purpose. This app is statically pre-rendered
// (vite-react-ssg) — whatever renders on first paint is literally what
// ends up baked into the static HTML served to crawlers / "view source."
// Defaulting to ComingSoon means the real page content is never present
// in that static output; it only appears after a real browser runs the
// checks below and confirms an unlock condition. Legitimate visitors see
// a brief flash of the lock screen before it swaps — the deliberate
// tradeoff for that.
//
// HONESTY NOTE: the bypass key is NOT real security — it ships inside the
// public JS bundle, so anyone inspecting network requests or source can
// find it. It's a soft "keep casual visitors from stumbling onto this
// before launch" gate, not protection for anything sensitive. The site's
// actual login/auth behind it is a separate, real mechanism, untouched by
// any of this.
export default function LaunchGate({ children }) {
  const location = useLocation();
  const { user } = useAuth();
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    // Past the launch date — permanently open for everyone, no further
    // checks needed. If VITE_LAUNCH_DATE was never set, this never fires.
    if (LAUNCH_DATE && Date.now() >= new Date(LAUNCH_DATE).getTime()) {
      setUnlocked(true);
      return;
    }

    // Already logged in (any role) — covers test accounts and the owner
    // alike, on every page, not just their own dashboard.
    if (user) {
      setUnlocked(true);
      return;
    }

    // /login stays reachable even while locked, so a known test account
    // can actually get in. Every other page (landing, signup, track,
    // about, etc.) stays gated for a logged-out, non-bypassed visitor.
    if (location.pathname === "/login") {
      setUnlocked(true);
      return;
    }

    // AGENT-ONLY SOFT LAUNCH: /signup (the role-choice screen) and
    // /signup/agent stay reachable so agents can register over the
    // weekend ahead of Monday's public launch — every other route,
    // including /signup/customer and /signup/admin, stays gated exactly
    // as before. Remove this block once the full site opens (or just let
    // VITE_LAUNCH_DATE flip `unlocked` for everyone automatically).
    if (location.pathname === "/signup" || location.pathname === "/signup/agent") {
      setUnlocked(true);
      return;
    }

    // Bypass link: ?key=... sets a persistent flag on this device so it
    // only needs to be used once, not re-entered on every visit.
    const params = new URLSearchParams(location.search);
    const keyParam = params.get("key");
    if (BYPASS_SECRET && keyParam === BYPASS_SECRET) {
      localStorage.setItem(BYPASS_STORAGE_KEY, "true");
      setUnlocked(true);
      return;
    }
    if (localStorage.getItem(BYPASS_STORAGE_KEY) === "true") {
      setUnlocked(true);
      return;
    }

    setUnlocked(false);
  }, [location, user]);

  return unlocked ? children : <ComingSoon />;
}
