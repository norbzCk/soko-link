import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../features/auth/AuthContext";
import { BrandMark } from "./BrandMark";
import { useEffect } from "react";
import { getInitials, resolveImageUrl } from "../lib/format";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Settings,
  LogOut,
  Truck,
  Store,
  CreditCard,
  X,
  ShieldCheck,
  BarChart3,
  BadgeCheck,
  Bell,
  ChevronRight,
} from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: typeof Store;
  show: boolean;
  end?: boolean;
  group: "workspace" | "manage";
}

export function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const { user, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname, setIsOpen]);

  const role = String(user?.role || "");
  const isSeller = role === "seller";
  const isCustomer = role === "user";
  const isLogistics = role === "logistics";
  const isSuperadmin = role === "super_admin" || role === "owner";
  const isAdmin = role === "admin";
  const isAnalyst = role === "analyst";

  const displayName = user?.name || user?.business_name || user?.owner_name || user?.email || "User";
  const roleLabel = isSeller
    ? "Business Hub"
    : isCustomer
      ? "Customer Hub"
      : isLogistics
        ? "Delivery Workspace"
        : isAnalyst
          ? "Analytics Workspace"
          : "Admin Panel";

  const navItems: NavItem[] = [
    { to: "/app/superadmin", label: "Dashboard", icon: LayoutDashboard, show: isSuperadmin, end: true, group: "workspace" },
    { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, show: isAdmin, end: true, group: "workspace" },
    { to: "/app/analyst", label: "Analytics", icon: BarChart3, show: isAnalyst, end: true, group: "workspace" },
    { to: "/app/seller", label: "Dashboard", icon: LayoutDashboard, show: isSeller, end: true, group: "workspace" },
    { to: "/app/customer", label: "Dashboard", icon: LayoutDashboard, show: isCustomer, end: true, group: "workspace" },
    { to: "/app/logistics", label: "Deliveries", icon: LayoutDashboard, show: isLogistics, end: true, group: "workspace" },
    { to: "/app/products", label: "Marketplace", icon: Store, show: isSeller || isCustomer || isAdmin || isSuperadmin, group: "workspace" },
    { to: "/app/orders", label: "Orders", icon: ShoppingCart, show: isSeller || isCustomer || isAdmin || isSuperadmin, group: "workspace" },
    { to: "/app/notifications", label: "Notifications", icon: Bell, show: true, group: "workspace" },
    { to: "/app/payments", label: "Payments", icon: CreditCard, show: isCustomer || isSuperadmin, group: "workspace" },
    { to: "/app/providers", label: "Suppliers", icon: Truck, show: isSeller || isAdmin || isSuperadmin, group: "manage" },
    { to: "/app/seller/deliveries", label: "Shipments", icon: Truck, show: isSeller || isSuperadmin, group: "manage" },
    { to: "/app/customers", label: "Customers", icon: Users, show: isSuperadmin, group: "manage" },
    { to: "/app/users", label: "Directory", icon: Users, show: isSuperadmin || isAdmin, group: "manage" },
    { to: "/app/iam", label: "IAM Console", icon: ShieldCheck, show: isSuperadmin || isAdmin, group: "manage" },
    { to: "/app/roles", label: "Roles & Access", icon: BadgeCheck, show: isSuperadmin || isAdmin, group: "manage" },
  ];

  const visibleItems = navItems.filter((item) => item.show);
  const workspaceItems = visibleItems.filter((item) => item.group === "workspace");
  const manageItems = visibleItems.filter((item) => item.group === "manage");

  function renderLink(item: NavItem) {
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          `group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${
            isActive
              ? "bg-brand-light text-brand"
              : "text-[var(--sidebar-text-muted)] hover:bg-surface-soft hover:text-[var(--sidebar-text)]"
          }`
        }
      >
        {({ isActive }) => (
          <>
            <item.icon size={17} className={isActive ? "text-brand" : "text-[var(--sidebar-text-muted)] group-hover:text-[var(--sidebar-text)]"} />
            <span className="flex-1 truncate">{item.label}</span>
            <ChevronRight
              size={13}
              className={`transition-opacity ${isActive ? "text-brand opacity-60" : "opacity-0 group-hover:opacity-40"}`}
            />
            {isActive ? (
              <motion.span
                layoutId="sidebar-active-bar"
                className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            ) : null}
          </>
        )}
      </NavLink>
    );
  }

  const sidebarContent = (
    <div className="relative flex h-full flex-col overflow-hidden border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] text-[var(--sidebar-text)]">
      <div className="pointer-events-none absolute inset-0 z-0 opacity-40">
        <div className="absolute -left-24 -top-24 h-56 w-56 rounded-full bg-brand/15 blur-[90px]" />
        <div className="absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-accent/10 blur-[90px]" />
      </div>

      <div className="relative z-10 flex h-full flex-col px-4 py-5">
        <header className="mb-5 flex items-center justify-between px-1">
          <BrandMark subtitle={roleLabel} />
          <button
            onClick={() => setIsOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--sidebar-text-muted)] transition-colors hover:bg-surface-soft hover:text-text md:hidden"
            aria-label="Close navigation"
          >
            <X size={17} />
          </button>
        </header>

        <div className="mb-5 rounded-xl border border-[var(--sidebar-border)] bg-surface/60 p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand text-xs font-bold text-white">
              {user?.profile_photo ? (
                <img src={resolveImageUrl(user.profile_photo)} alt="" className="h-full w-full object-cover" />
              ) : (
                getInitials(displayName)
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--sidebar-text)]">{displayName}</p>
              <p className="truncate text-[10px] font-medium uppercase tracking-wide text-brand">{roleLabel}</p>
            </div>
          </div>
        </div>

        <nav className="no-scrollbar flex-1 space-y-4 overflow-y-auto">
          <div className="space-y-0.5">
            <p className="px-3 pb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-text-muted)]/70">
              Workspace
            </p>
            {workspaceItems.map(renderLink)}
          </div>
          {manageItems.length ? (
            <div className="space-y-0.5">
              <p className="px-3 pb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--sidebar-text-muted)]/70">
                Manage
              </p>
              {manageItems.map(renderLink)}
            </div>
          ) : null}
        </nav>

        <footer className="mt-4 space-y-1 border-t border-[var(--sidebar-border)] pt-4">
          <NavLink
            to={isSuperadmin ? "/app/superadmin/settings" : "/app/settings"}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-[var(--sidebar-text-muted)] transition-colors hover:bg-surface-soft hover:text-[var(--sidebar-text)]"
          >
            <Settings size={17} />
            <span>Settings</span>
          </NavLink>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-danger/80 transition-colors hover:bg-danger/5 hover:text-danger"
          >
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </footer>
      </div>
    </div>
  );

  return (
    <>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm md:hidden"
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen ? (
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="fixed bottom-0 left-0 top-0 z-50 w-[17rem] md:hidden"
          >
            {sidebarContent}
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <aside className="hidden w-[16.5rem] shrink-0 md:block">
        <div className="sticky top-0 h-screen w-full">{sidebarContent}</div>
      </aside>
    </>
  );
}
