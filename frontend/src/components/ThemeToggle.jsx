import { Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

// Drop this anywhere — the Navbar is the obvious spot, but it works
// standalone anywhere in the tree since it just reads/writes ThemeContext.
export default function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-ink dark:text-paper hover:bg-ink/10 dark:hover:bg-paper/10 transition-colors ${className}`}
    >
      {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </button>
  );
}
