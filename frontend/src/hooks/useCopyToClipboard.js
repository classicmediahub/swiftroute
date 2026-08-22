import { useState, useCallback, useRef } from "react";

// Wraps navigator.clipboard with a fallback for older browsers / non-HTTPS
// contexts, and tracks a `copied` flag that auto-resets after `resetDelay`
// — that's the piece every call site would otherwise have to reimplement
// itself (the setTimeout, the cleanup, the fallback) just to show a
// checkmark for a moment after a successful copy.
export function useCopyToClipboard(resetDelay = 1500) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);

  const copy = useCallback(
    async (text) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback: a hidden, off-screen textarea + the legacy copy
          // command — still needed for non-secure contexts (plain http)
          // or older browsers where navigator.clipboard doesn't exist.
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        }
        setCopied(true);
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), resetDelay);
        return true;
      } catch {
        return false;
      }
    },
    [resetDelay]
  );

  return { copied, copy };
}
