import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";
import logo from "../assets/pne-logo.png";

// Shared styling for every plain text nav link (Rides/Gas/Food/Dashboard/
// Log in) — uppercase + letter-spacing + an underline that grows in on
// hover rather than a flat color swap, which is what actually reads as
// "classic" rather than "modern SaaS app bar." Centralized here so all
// five links stay pixel-identical rather than drifting apart edit by edit.
// Unchanged from before — this is the desktop (md+) styling only.
const navLinkClass =
  "relative text-xs font-medium uppercase tracking-widest text-slate-light hover:text-paper transition-colors py-1 " +
  "after:content-[''] after:absolute after:left-0 after:-bottom-0.5 after:h-px after:w-0 after:bg-route " +
  "after:transition-[width] after:duration-300 hover:after:w-full";

// Mobile menu's own link style — deliberately much larger tap targets
// (full-width rows, generous vertical padding) than the desktop version
// above, since a thumb needs a real target, not a hover-underline trick
// that means nothing on a touchscreen.
const mobileLinkClass =
  "block w-full text-left text-sm font-medium uppercase tracking-widest text-paper py-3.5 px-1 border-b border-line/60";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu automatically on navigation — otherwise it'd
  // stay open over the new page after tapping a link, which reads as
  // broken rather than intentional.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // Locks background scroll while the mobile menu is open — without
  // this, the page behind a full-screen menu keeps scrolling under a
  // thumb swipe, which feels like the menu isn't really "there."
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

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
      <div className="max-w-6xl mx-auto px-5 h-16 md:h-20 flex items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center shrink-0">
            <span className="bg-paper rounded-lg px-2.5 py-1.5 flex items-center">
              <img src={logo} alt="Pick N' Earn" className="h-7 md:h-8 w-auto" />
            </span>
          </Link>
          {/* Structural divider — a plain vertical rule next to the mark
              is a small but genuinely "classic masthead" touch (think a
              newspaper nameplate next to its section rule), rather than
              the logo floating alone against a wall of nav links.
              md+ only now, alongside the rest of the desktop nav group. */}
          <span className="hidden md:block w-px h-6 bg-line/80" aria-hidden="true" />
          <nav className="hidden md:flex items-center gap-6">
            {showCustomerLinks && (
              <>
                <Link to="/rides" className={navLinkClass}>Rides</Link>
                <Link to="/gas" className={navLinkClass}>Gas</Link>
                <Link to="/food" className={navLinkClass}>Food</Link>
              </>
            )}
          </nav>
        </div>

        {/* Desktop-only right-side group — completely unchanged from
            before, just now gated behind md+ so it never has to compete
            for space with the hamburger button on a phone screen. */}
        <div className="hidden md:flex items-center gap-5">
          {user ? (
            <>
              <Link to={dashboardPath} className={navLinkClass}>Dashboard</Link>
              <span className="text-xs font-mono text-slate-light border border-line rounded-full px-2.5 py-1">
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
          <ThemeToggle alwaysLight className="ml-1" />
        </div>

        {/* Mobile-only controls: theme toggle stays visible at all times
            (it's one tap, no need to hide it in the menu), hamburger
            opens everything else. 44px square hit target on the button
            itself, not just the icon glyph inside it. */}
        <div className="flex md:hidden items-center gap-1">
          <ThemeToggle alwaysLight />
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="flex items-center justify-center w-11 h-11 -mr-2 text-paper"
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu panel — full-width dropdown below the header rather
          than a separate route or portal, so back-button/escape behavior
          stays exactly what a person already expects from a normal page
          element. Every row here uses mobileLinkClass's generous padding
          instead of the desktop nav's compact hover-underline style. */}
      {menuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-ink border-b border-line/80 px-5 pb-5 max-h-[calc(100vh-4rem)] overflow-y-auto">
          {showCustomerLinks && (
            <nav>
              <Link to="/rides" className={mobileLinkClass}>Rides</Link>
              <Link to="/gas" className={mobileLinkClass}>Gas</Link>
              <Link to="/food" className={mobileLinkClass}>Food</Link>
            </nav>
          )}

          {user ? (
            <>
              <Link to={dashboardPath} className={mobileLinkClass}>Dashboard</Link>
              <div className="text-xs font-mono text-slate-light py-3.5 border-b border-line/60">
                Signed in as {user.full_name.split(" ")[0]} · {user.role}
              </div>
              <button
                onClick={handleLogout}
                className="w-full text-left text-sm font-medium uppercase tracking-widest text-paper py-3.5 px-1"
              >
                Log out
              </button>
            </>
          ) : (
            <div className="pt-4 space-y-3">
              <Link
                to="/login"
                className="block w-full text-center text-sm font-medium uppercase tracking-widest text-paper border border-line rounded-lg py-3.5"
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="block w-full text-center text-sm font-semibold uppercase tracking-widest text-ink bg-route rounded-lg py-3.5"
              >
                Get started
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
