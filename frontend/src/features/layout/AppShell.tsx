import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../auth/ThemeContext";
import { Sidebar } from "../../components/Sidebar";
import { Bell, Menu, Moon, RefreshCw, Sun, ExternalLink } from "lucide-react";
import { useState } from "react";
import { getPostLoginPath, normalizeRole } from "../auth/authStorage";
import { resolveImageUrl, getInitials } from "../../lib/format";

export function AppShell() {
  const { user, switchRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { effectiveTheme: theme, toggleTheme } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const [roleError, setRoleError] = useState("");

  const role = String(user?.role || "");
  const availableRoles = Array.from(
    new Set((user?.roles || []).map((entry) => normalizeRole(entry)).filter(Boolean)),
  );

  async function handleRoleSwitch(nextRole: string) {
    if (!nextRole || nextRole === role) return;
    setRoleError("");
    setSwitchingRole(true);
    try {
      const next = await switchRole(nextRole.toUpperCase());
      navigate(getPostLoginPath(next), { replace: true });
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : "Unable to switch role");
    } finally {
      setSwitchingRole(false);
    }
  }

  const roleLabel =
    role === "seller"
      ? "Seller"
      : role === "user"
        ? "Buyer"
        : role === "logistics"
          ? "Delivery agent"
          : role === "analyst"
            ? "Analyst"
            : role === "super_admin"
              ? "Super admin"
              : role === "owner"
                ? "Owner"
                : "Admin";

  const currentSection =
    location.pathname
      .replace(/^\/app\/?/, "")
      .split("/")
      .filter(Boolean)
      .map((segment) => segment.replace(/-/g, " "))
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" / ") || "Dashboard";

  const displayName = user?.name || user?.business_name || user?.owner_name || user?.email || "User";
  const profilePath =
    role === "seller"
      ? "/app/seller/profile"
      : role === "logistics"
        ? "/app/logistics/profile"
        : role === "user"
          ? "/app/customer/profile"
          : role === "analyst"
            ? "/app/settings"
            : role === "super_admin"
              ? "/app/superadmin/profile"
              : "/app/profile";

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 px-3 pt-3 md:px-6 md:pt-4">
          <div className="mx-auto flex h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-surface/85 px-3 shadow-soft backdrop-blur-xl md:h-16 md:px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="icon-btn !h-9 !w-9 md:hidden"
                aria-label="Open navigation"
              >
                <Menu size={18} />
              </button>

              <div className="min-w-0">
                <h1 className="truncate font-display text-base font-semibold tracking-tight text-text md:text-lg">
                  {currentSection}
                </h1>
                <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  {roleLabel} workspace
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 md:gap-1.5">
              {availableRoles.length > 1 ? (
                <label className="relative hidden items-center sm:flex">
                  <span className="sr-only">Switch active role</span>
                  <RefreshCw
                    size={13}
                    className={`pointer-events-none absolute left-2.5 text-text-muted ${switchingRole ? "animate-spin" : ""}`}
                  />
                  <select
                    value={role}
                    disabled={switchingRole}
                    onChange={(event) => void handleRoleSwitch(event.target.value)}
                    className="h-9 appearance-none rounded-lg border border-border bg-surface-soft pl-7 pr-6 text-[10px] font-semibold uppercase tracking-wide text-text outline-none transition-colors hover:bg-surface-strong focus:border-brand disabled:opacity-60"
                  >
                    {availableRoles.map((entry) => (
                      <option key={entry} value={entry}>
                        {entry.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <Link to="/" className="icon-btn !h-9 !w-9" title="View marketplace" aria-label="View marketplace">
                <ExternalLink size={17} />
              </Link>

              <button
                onClick={toggleTheme}
                className="icon-btn !h-9 !w-9"
                title="Toggle theme"
                aria-label="Toggle theme"
              >
                {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
              </button>

              <Link
                to="/app/notifications"
                className="icon-btn !h-9 !w-9"
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell size={17} />
              </Link>

              <Link
                to={profilePath}
                className="ml-0.5 flex items-center gap-2 rounded-xl border border-border bg-surface-soft p-1 pr-2.5 transition-colors hover:bg-surface-strong"
              >
                <div className="h-7 w-7 overflow-hidden rounded-lg bg-brand">
                  {user?.profile_photo ? (
                    <img src={resolveImageUrl(user.profile_photo)} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white">
                      {getInitials(displayName)}
                    </div>
                  )}
                </div>
                <span className="hidden max-w-[7rem] truncate text-xs font-semibold text-text md:block">
                  {displayName.split(" ")[0]}
                </span>
              </Link>
            </div>
          </div>

          {roleError ? (
            <div className="mx-auto mt-2 max-w-7xl rounded-xl border border-danger/20 bg-danger/10 px-3.5 py-2 text-xs font-medium text-danger">
              {roleError}
            </div>
          ) : null}
        </header>

        <div className="flex-1 px-3 pb-8 pt-4 md:px-6 md:pt-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
