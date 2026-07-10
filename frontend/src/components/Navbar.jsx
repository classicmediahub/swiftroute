import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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
    user?.role === "admin" ? "/admin/dashboard" : "/";

  return (
    <header className="sticky top-0 z-50 bg-ink/95 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-display font-semibold text-lg text-paper">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="7" fill="#FFC63D" />
            <path d="M6 22 C10 22, 10 10, 16 10 S22 22, 26 22" stroke="#0B1220" strokeWidth="3" fill="none" strokeLinecap="round" />
          </svg>
          SwiftRoute
        </Link>

        <nav className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                to={dashboardPath}
                className="text-sm text-slate-light hover:text-paper transition-colors font-medium"
              >
                Dashboard
              </Link>
              <span className="hidden sm:inline text-xs font-mono text-slate-light border border-line rounded-full px-2.5 py-1">
                {user.full_name.split(" ")[0]} · {user.role}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-paper bg-ink-soft hover:bg-line border border-line rounded-lg px-3.5 py-1.5 transition-colors"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium text-slate-light hover:text-paper transition-colors">
                Log in
              </Link>
              <Link
                to="/signup"
                className="text-sm font-semibold text-ink bg-route hover:bg-route-dark rounded-lg px-4 py-2 transition-colors"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
