import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="font-mono text-sm text-slate">Loading session…</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    const fallback =
      user.role === "customer" ? "/customer/dashboard" :
      user.role === "agent" ? "/agent/dashboard" :
      "/admin/dashboard";
    return <Navigate to={fallback} replace />;
  }
  return children;
}
