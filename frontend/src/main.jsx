import { ViteReactSSG } from "vite-react-ssg";
import routes from "./App.jsx";
import "./index.css";

// Note: <StrictMode> is no longer wrapped here — vite-react-ssg owns the
// render entry point itself. This only affects React's extra dev-mode
// double-render checks, not production behavior.
export const createRoot = ViteReactSSG({ routes });

// This file runs in two very different places: once in Node at BUILD time
// (vite-react-ssg prerendering each route to static HTML) and once for
// real in the browser at RUNTIME. `window`/`navigator` don't exist in the
// first case, so this whole block would throw during the build without
// the typeof guard — same reasoning as AuthContext.jsx never touching
// localStorage outside a useEffect. Deferred to `load` so service worker
// registration never competes with the actual page becoming interactive.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  });
}
