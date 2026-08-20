import { Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

// Drop this anywhere — the Navbar is the obvious spot, but it works
// standalone anywhere in the tree since it just reads/writes ThemeContext.
//
// `alwaysLight`: set this when the toggle sits on a surface that's
// permanently dark regardless of the site-wide theme (like a navbar
// styled bg-ink even on light mode) — without it, the icon defaults to
// text-ink (dark) in light mode and would be invisible against an
// always-dark background. Mixing "text-ink" and a later "text-paper"
// override in the same className string doesn't reliably work in
// Tailwind, since which one wins depends on stylesheet generation order,
// not the order they're written in JSX — so this is a real prop, not
// just an extra class tacked on the end.
export default function ThemeToggle({ className = "", alwaysLight = false }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  const colorClasses = alwaysLight
    ? "text-paper hover:bg-paper/10"
    : "text-ink dark:text-paper hover:bg-ink/10 dark:hover:bg-paper/10";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors ${colorClasses} ${className}`}
    >
      {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </button>
  );
}
