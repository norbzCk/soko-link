import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { getPostLoginPath, normalizeRole } from "./authStorage";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, token } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-brand/30 border-t-brand rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold text-text-muted">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

export function RoleRoute({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles: string[];
}) {
  const { loading, token, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-brand/30 border-t-brand rounded-full animate-spin mx-auto" />
          <p className="text-sm font-bold text-text-muted">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const role = normalizeRole(String(user?.role || ""));
  const allowed = allowedRoles.map((item) => normalizeRole(item));
  if (!allowed.includes(role)) {
    return <Navigate to={getPostLoginPath(user)} replace />;
  }

  return <>{children}</>;
}
