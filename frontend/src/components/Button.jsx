import { Loader2 } from "lucide-react";

// One button for every submit/action across the app, instead of each form
// hand-rolling its own "disabled={loading} ... {loading ? 'Saving…' :
// 'Save'}" pattern slightly differently. Two real problems this fixes,
// not just a style cleanup:
//   1. Consistency — every loading state now looks and behaves the same
//      way (spinner + optional text swap) instead of varying slightly by
//      whichever pattern a given form happened to use.
//   2. A real bug class — `disabled` is forced true while `loading` is
//      true, which is what actually prevents someone on a slow connection
//      from double-clicking "Submit" and firing the request twice. Any
//      call site that forgets to wire up its own disabled-while-loading
//      logic gets it for free here.
const VARIANTS = {
  primary: "bg-route hover:bg-route-dark text-ink",
  secondary: "border border-slate-300 dark:border-line text-ink dark:text-paper hover:border-slate-400 dark:hover:border-slate-light bg-transparent",
  ghost: "text-ink dark:text-paper hover:bg-ink/5 dark:hover:bg-paper/10 bg-transparent",
  destructive: "bg-signal hover:bg-brand-dark text-white",
  dark: "bg-ink hover:bg-ink-soft text-paper",
};

const SIZES = {
  sm: "text-xs px-3 py-2",
  md: "text-sm px-4 py-2.5",
  lg: "text-sm px-5 py-3",
};

export default function Button({
  children,
  loading = false,
  loadingText,
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  disabled = false,
  type = "button",
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading}
      className={`inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
        VARIANTS[variant]
      } ${SIZES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      <span>{loading && loadingText ? loadingText : children}</span>
    </button>
  );
}
