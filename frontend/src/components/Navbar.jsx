import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";
import logo from "../assets/pne-logo.png";

// Shared styling for every plain text nav link (Rides/Gas/Food/Dashboard/
// Log in) — uppercase + letter-spacing + an underline that grows in on
// hover rather than a flat color swap, which is what actually reads as
// "classic" rather than "modern SaaS app bar." Centralized here so all
// five links stay pixel-identical rather than drifting apart edit by edit.
const navLinkClass =
  "relative text-xs font-medium uppercase tracking-widest text-slate-light hover:text-paper transition-colors py-1 " +
  "after:content-[''] after:absolute after:left-0 after:-bottom-0.5 after:h-px after:w-0 after:bg-route " +
  "after:transition-[width] after:duration-300 hover:after:w-full";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  const dashboardPath =
    user?.role === "customer" ? "/customer/dashboard" :
    user?.role === "agent" ? "/agent/dashboard" :
    user?.role === "admin" ? "/admin/dashboard" :
    user?.role === "outlet" ? "/outlet/dashboard" : "/";

  // Customer-facing ordering links — shown to logged-out visitors (routes
  // through the login gate, same as any protected link) and logged-in
  // customers only. Agents, admins, and outlets each have their own
  // dashboard instead of a browsing nav.
  const showCustomerLinks = !user || user.role === "customer";

  return (
    <header className="sticky top-0 z-50 bg-ink/95 backdrop-blur border-b border-line/80">
      <div className="max-w-6xl mx-auto px-5 h-20 flex items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center shrink-0">
            <span className="bg-paper rounded-lg px-2.5 py-1.5 flex items-center">
              <img src={logo} alt="Pick N' Earn" className="h-8 w-auto" />
            </span>
          </Link>
          {/* Structural divider — a plain vertical rule next to the mark
              is a small but genuinely "classic masthead" touch (think a
              newspaper nameplate next to its section rule), rather than
              the logo floating alone against a wall of nav links. */}
          <span className="hidden sm:block w-px h-6 bg-line/80" aria-hidden="true" />
          <nav className="flex items-center gap-4 sm:gap-6 overflow-x-auto">
            {showCustomerLinks && (
              <>
                <Link to="/rides" className={navLinkClass}>Rides</Link>
                <Link to="/gas" className={navLinkClass}>Gas</Link>
                <Link to="/food" className={navLinkClass}>Food</Link>
              </>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-5">
          {user ? (
            <>
              <Link to={dashboardPath} className={navLinkClass}>Dashboard</Link>
              <span className="hidden sm:inline text-xs font-mono text-slate-light border border-line rounded-full px-2.5 py-1">
                {user.full_name.split(" ")[0]} · {user.role}
              </span>
              <button
                onClick={handleLogout}
                className="text-xs font-medium uppercase tracking-widest text-paper bg-ink-soft hover:bg-line border border-line rounded-md px-4 py-2 transition-colors"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={navLinkClass}>Log in</Link>
              <Link
                to="/signup"
                className="text-xs font-semibold uppercase tracking-widest text-ink bg-route hover:bg-route-dark rounded-md px-5 py-2.5 transition-colors"
              >
                Get started
              </Link>
            </>
          )}
          {/* alwaysLight: this navbar stays bg-ink regardless of site
              theme, so the toggle icon needs to stay light-colored too
              rather than following the default light/dark text swap. */}
          <ThemeToggle alwaysLight className="ml-1" />
        </div>
      </div>
    </header>
  );
}
