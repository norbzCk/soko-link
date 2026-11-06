import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  UserCheck,
  UserX,
  RefreshCw,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
import { apiRequest } from "../lib/http";
import { PageIntro, SectionCard, StatCards } from "../components/ui/PageSections";

interface RoleEntry {
  role: string;
  status: string;
}

interface IamIdentity {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  status: string;
  email_verified: boolean;
  phone_verified: boolean;
  roles: RoleEntry[];
}

interface RoleApplication {
  id: number;
  identity_id: number;
  role: string;
  status: string;
  payload?: Record<string, unknown>;
  rejection_reason?: string | null;
  created_at?: string;
  identity?: IamIdentity | null;
}

const ROLE_OPTIONS = ["CUSTOMER", "SELLER", "LOGISTICS_PROVIDER", "ADMINISTRATOR", "ANALYST"];
const STATUS_OPTIONS = ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "DISABLED"];

function label(value?: string) {
  return String(value || "").replace(/_/g, " ").toLowerCase();
}

function StatusBadge({ value }: { value?: string }) {
  const normalized = String(value || "").toUpperCase();
  const style =
    normalized === "APPROVED" || normalized === "ACTIVE"
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
      : normalized === "PENDING" || normalized === "PENDING_VERIFICATION"
        ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
        : "bg-danger/10 text-danger border-danger/20";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${style}`}>
      {label(normalized)}
    </span>
  );
}

export function IamAdminPage() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<RoleApplication[]>([]);
  const [identities, setIdentities] = useState<IamIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roleDrafts, setRoleDrafts] = useState<Record<number, string>>({});

  const isSuperadmin = ["super_admin", "owner"].includes(String(user?.role || ""));

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [apps, ids] = await Promise.all([
        apiRequest<RoleApplication[]>("/auth/admin/applications"),
        apiRequest<IamIdentity[]>("/auth/admin/identities"),
      ]);
      setApplications(apps);
      setIdentities(ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load IAM data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (["admin", "super_admin", "owner"].includes(String(user?.role || ""))) {
      void load();
    }
  }, [user?.role]);

  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key);
    setError("");
    setFlash("");
    try {
      await action();
      setFlash(success);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy("");
    }
  }

  function approve(application: RoleApplication) {
    return run(
      `approve-${application.id}`,
      () => apiRequest(`/auth/admin/applications/${application.id}/approve`, { method: "POST" }),
      "Application approved and role activated."
    );
  }

  function reject(application: RoleApplication) {
    const reason = window.prompt("Reason for rejecting this application (optional):", "") || "";
    return run(
      `reject-${application.id}`,
      () => apiRequest(`/auth/admin/applications/${application.id}/reject`, { method: "POST", body: { reason } }),
      "Application rejected."
    );
  }

  function assignRole(identity: IamIdentity) {
    const role = roleDrafts[identity.id] || "CUSTOMER";
    return run(
      `role-${identity.id}`,
      () => apiRequest(`/auth/admin/identities/${identity.id}/roles`, {
        method: "POST",
        body: { role, status: "APPROVED" },
      }),
      `${label(role)} role assigned.`
    );
  }

  function updateStatus(identity: IamIdentity, status: string) {
    return run(
      `status-${identity.id}`,
      () => apiRequest(`/auth/admin/identities/${identity.id}/status`, {
        method: "PATCH",
        body: { status },
      }),
      "Account status updated."
    );
  }

  const pendingApplications = useMemo(
    () => applications.filter((application) => application.status === "PENDING"),
    [applications]
  );

  const filteredIdentities = useMemo(() => {
    const query = search.trim().toLowerCase();
    return identities.filter((identity) => {
      if (statusFilter !== "ALL" && identity.status !== statusFilter) return false;
      if (!query) return true;
      return [identity.name, identity.email, identity.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [identities, search, statusFilter]);

  if (!["admin", "super_admin", "owner"].includes(String(user?.role || ""))) {
    return (
      <div className="mx-auto max-w-7xl p-8">
        <PageIntro
          eyebrow="Access denied"
          title="IAM clearance required"
          description="Your current role cannot manage identities, roles, or access applications."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <PageIntro
        eyebrow="Identity and access management"
        title="IAM Console"
        description="Review role applications, assign roles, verify account details, and enforce account status across every SokoLink workspace."
        actions={
          <button className="btn-secondary flex h-12 items-center gap-2 px-5" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      <StatCards
        items={[
          { id: "pending", label: "Pending applications", value: pendingApplications.length, icon: <Clock size={18} />, note: "Awaiting review" },
          { id: "identities", label: "Identities", value: identities.length, icon: <ShieldCheck size={18} />, note: "Unified accounts" },
          { id: "verified", label: "Email verified", value: identities.filter((identity) => identity.email_verified).length, icon: <UserCheck size={18} />, note: "Verification complete" },
          { id: "restricted", label: "Restricted", value: identities.filter((identity) => ["SUSPENDED", "DISABLED"].includes(identity.status)).length, icon: <UserX size={18} />, note: "Suspended or disabled" },
        ]}
      />

      {error ? <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-xs font-bold text-danger">{error}</div> : null}
      {flash ? <div className="rounded-2xl border border-accent/20 bg-accent/10 p-4 text-xs font-bold text-accent">{flash}</div> : null}

      <SectionCard
        title="Role applications"
        description="Seller and logistics access requires verification and an administrator decision."
      >
        {pendingApplications.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface-soft p-6 text-sm font-semibold text-text-muted">
            No pending applications.
          </p>
        ) : (
          <div className="space-y-3">
            {pendingApplications.map((application) => (
              <article key={application.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-text">{application.identity?.name || `Identity #${application.identity_id}`}</span>
                    <StatusBadge value={application.status} />
                    <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-brand">
                      {label(application.role)}
                    </span>
                  </div>
                  <p className="truncate text-xs font-semibold text-text-muted">{application.identity?.email}</p>
                  <p className="text-[11px] font-medium text-text-muted">
                    {application.identity?.email_verified ? "Email verified" : "Email not verified"} ·{" "}
                    {application.identity?.phone_verified ? "Phone verified" : "Phone not verified"}
                    {application.payload?.business_name ? ` · ${String(application.payload.business_name)}` : ""}
                    {application.payload?.base_area ? ` · ${String(application.payload.base_area)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="btn-primary flex h-10 items-center gap-2 px-4"
                    disabled={busy === `approve-${application.id}`}
                    onClick={() => void approve(application)}
                  >
                    <CheckCircle2 size={15} />
                    Approve
                  </button>
                  <button
                    className="btn-secondary flex h-10 items-center gap-2 px-4 text-danger"
                    disabled={busy === `reject-${application.id}`}
                    onClick={() => void reject(application)}
                  >
                    <XCircle size={15} />
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Identity directory"
        description="Manage account status and assign additional approved roles."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search identities..."
                className="modern-input h-10 min-w-[220px] pl-10 text-xs"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="modern-input h-10 min-w-[170px] text-xs"
            >
              <option value="ALL">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{label(status)}</option>
              ))}
            </select>
          </div>
        }
      >
        {loading ? (
          <p className="p-6 text-sm font-semibold text-text-muted">Loading identities...</p>
        ) : filteredIdentities.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface-soft p-6 text-sm font-semibold text-text-muted">
            No identities match the current filters.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filteredIdentities.map((identity) => (
              <article key={identity.id} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <h3 className="truncate text-sm font-black text-text">{identity.name}</h3>
                    <p className="truncate text-xs font-semibold text-text-muted">{identity.email}</p>
                    <p className="text-[11px] font-medium text-text-muted">{identity.phone || "No phone number"}</p>
                  </div>
                  <StatusBadge value={identity.status} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${identity.email_verified ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600" : "border-amber-500/20 bg-amber-500/10 text-amber-600"}`}>
                    Email {identity.email_verified ? "verified" : "pending"}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${identity.phone_verified ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600" : "border-amber-500/20 bg-amber-500/10 text-amber-600"}`}>
                    Phone {identity.phone_verified ? "verified" : "pending"}
                  </span>
                  {identity.roles.map((entry) => (
                    <span key={entry.role} className="rounded-full border border-border bg-surface-soft px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-text-muted">
                      {label(entry.role)} · {label(entry.status)}
                    </span>
                  ))}
                </div>

                <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
                  <select
                    value={identity.status}
                    onChange={(event) => void updateStatus(identity, event.target.value)}
                    disabled={busy === `status-${identity.id}`}
                    className="modern-input h-10 flex-1 text-xs"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{label(status)}</option>
                    ))}
                  </select>
                  <select
                    value={roleDrafts[identity.id] || "CUSTOMER"}
                    onChange={(event) => setRoleDrafts((current) => ({ ...current, [identity.id]: event.target.value }))}
                    className="modern-input h-10 flex-1 text-xs"
                  >
                    {ROLE_OPTIONS.filter((role) => isSuperadmin || !["ADMINISTRATOR", "ANALYST"].includes(role)).map((role) => (
                      <option key={role} value={role}>{label(role)}</option>
                    ))}
                  </select>
                  <button
                    className="btn-primary h-10 px-4 text-xs"
                    disabled={busy === `role-${identity.id}`}
                    onClick={() => void assignRole(identity)}
                  >
                    Assign role
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
