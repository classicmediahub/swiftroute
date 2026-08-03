import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/pne-logo.png";

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
        <Link to="/" className="flex items-center">
          <img src={logo} alt="Pick N' Earn" className="h-9 w-auto" />
        </Link>

        <nav className="flex items-center gap-3">
          {/* Rides is a customer-facing feature — shown to logged-out
              visitors (clicking it while logged out routes through the
              existing ProtectedRoute login gate, same as any other
              protected link) and to logged-in customers, but not to
              agents/admins, since /rides' ProtectedRoute is customer-only
              and would just redirect them away. */}
          {(!user || user.role === "customer") && (
            <Link to="/rides" className="text-sm text-slate-light hover:text-paper transition-colors font-medium">
              Rides
            </Link>
          )}
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
