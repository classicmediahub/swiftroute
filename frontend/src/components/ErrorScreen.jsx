import { useRouteError, isRouteErrorResponse, useNavigate } from "react-router-dom";
import { useState } from "react";

// Replaces React Router's default fallback — the plain "Unexpected
// Application Error!" text dump every crash today showed. Wired in as
// `errorElement` on the top-level route in App.jsx (see the comment
// there), which is what actually catches route-level render/loader
// errors — a plain nested <ErrorBoundary> component wouldn't catch all
// of these, since some of them (like a failed dynamic import) happen at
// the router layer, before a nested boundary further down the tree would
// ever get a chance to.
function BrokenParcelIllustration() {
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="44" cy="72" rx="26" ry="5" fill="currentColor" opacity="0.08" />
      {/* box, tipped and slightly open, with a crack — "something spilled",
          not "something exploded"; kept gentle rather than alarming */}
      <g transform="rotate(-6 44 44)">
        <path d="M18 36 44 26 70 36 70 60 44 70 18 60Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" fill="currentColor" fillOpacity="0.06" />
        <path d="M18 36 44 46 70 36" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M44 46V70" stroke="currentColor" strokeWidth="2.2" />
        <path d="M38 30 32 40 40 42 34 52" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      </g>
      {/* a couple of small "escaped" pieces, for a touch of personality */}
      <circle cx="14" cy="66" r="2.4" fill="currentColor" opacity="0.35" />
      <circle cx="76" cy="70" r="1.8" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

export default function ErrorScreen() {
  const error = useRouteError();
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);

  const status = isRouteErrorResponse(error) ? error.status : null;
  const technicalMessage =
    (isRouteErrorResponse(error) ? error.statusText || error.data : error?.message) || String(error || "Unknown error");

  function handleReload() {
    window.location.reload();
  }

  function handleGoHome() {
    // A full navigation rather than navigate("/") on purpose — if the
    // error came from a broken chunk/module load, client-side routing
    // might still be in a bad state; a real navigation guarantees a
    // clean reload of the shell.
    window.location.href = "/";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper dark:bg-ink px-5 py-16">
      <div className="max-w-sm w-full text-center">
        <div className="w-24 h-24 mx-auto rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center mb-5">
          <BrokenParcelIllustration />
        </div>

        <h1 className="font-display text-2xl font-semibold text-ink dark:text-paper mb-2">
          {status === 404 ? "Page not found" : "Something went wrong"}
        </h1>
        <p className="text-sm text-slate dark:text-slate-light mb-7">
          {status === 404
            ? "That page doesn't exist, or the link might be out of date."
            : "This screen shouldn't have shown up — reloading usually fixes it. If it keeps happening, let us know what you were doing."}
        </p>

        <div className="flex flex-col gap-2.5 mb-6">
          <button
            onClick={handleReload}
            className="w-full bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-5 py-3 transition-colors"
          >
            Reload page
          </button>
          <button
            onClick={handleGoHome}
            className="w-full text-sm font-medium text-slate dark:text-slate-light hover:text-ink dark:hover:text-paper transition-colors py-2"
          >
            Go to homepage
          </button>
        </div>

        {/* Collapsed by default — genuinely useful for reporting a bug,
            not something an ordinary visitor needs staring back at them. */}
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="text-xs font-mono text-slate-light hover:text-slate dark:hover:text-paper transition-colors underline decoration-dotted underline-offset-4"
        >
          {showDetails ? "Hide technical details" : "Show technical details"}
        </button>
        {showDetails && (
          <pre className="mt-3 text-left text-[11px] font-mono text-slate dark:text-slate-light bg-white dark:bg-ink-soft border border-slate-200 dark:border-line rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
            {technicalMessage}
          </pre>
        )}
      </div>
    </div>
  );
}
