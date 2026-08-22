import { Copy, Check } from "lucide-react";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";

// Drop-in copy button — icon swaps to a checkmark and the color shifts to
// the brand "success" green for a moment after a successful copy, then
// reverts on its own. Use `iconOnly` for tight spaces (a table row, a
// stat card); otherwise shows a short label next to the icon.
export default function CopyButton({ text, label = "Copy", className = "", iconOnly = false }) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <button
      type="button"
      onClick={() => copy(text)}
      aria-label={copied ? "Copied" : `Copy ${label}`}
      title={copied ? "Copied!" : label}
      className={`inline-flex items-center gap-1.5 text-xs font-medium transition-colors ${
        copied ? "text-delivered" : "text-slate hover:text-ink dark:text-slate-light dark:hover:text-paper"
      } ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {!iconOnly && <span>{copied ? "Copied!" : label}</span>}
    </button>
  );
}
