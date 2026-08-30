import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const DISMISS_KEY = "pae_install_prompt_dismissed";

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [dismissed, setDismissed] = useState(true); // default hidden until the effect below decides otherwise — never flash content only to hide it a moment later

  useEffect(() => {
    if (isStandalone()) return; // already installed and running as an app — nothing to prompt
    if (localStorage.getItem(DISMISS_KEY) === "true") return;

    setDismissed(false);

    // iOS Safari has no beforeinstallprompt event at all — "Add to Home
    // Screen" only exists behind the manual Share sheet, so the only
    // thing possible here is a one-time hint pointing at it.
    if (isIOS()) {
      setShowIOSHint(true);
      return;
    }

    function handleBeforeInstallPrompt(e) {
      e.preventDefault(); // stops Chrome's own mini-infobar so this custom banner controls the moment instead
      setDeferredPrompt(e);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    function handleInstalled() {
      setDeferredPrompt(null);
      setDismissed(true);
    }
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice; // resolves either way — an explicit "not now" shouldn't be treated differently from accept for banner purposes, both mean "stop asking"
    setDeferredPrompt(null);
    dismiss();
  }

  if (dismissed) return null;
  if (!showIOSHint && !deferredPrompt) return null; // Android/Chrome hasn't fired the event yet — nothing to show

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-sm z-40">
      <div className="bg-ink text-paper border border-line rounded-2xl p-4 shadow-lg flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-route/20 flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-route" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold mb-0.5">Install PickAndEarn</p>
          {showIOSHint ? (
            <p className="text-xs text-slate-light">
              Tap the Share icon, then "Add to Home Screen" for one-tap access.
            </p>
          ) : (
            <p className="text-xs text-slate-light">Add it to your home screen for quicker access.</p>
          )}
          {!showIOSHint && (
            <button
              onClick={handleInstallClick}
              className="mt-2.5 text-xs font-semibold text-ink bg-route hover:bg-route-dark rounded-lg px-3.5 py-1.5 transition-colors"
            >
              Install
            </button>
          )}
        </div>
        <button onClick={dismiss} className="text-slate-light hover:text-paper shrink-0" aria-label="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
