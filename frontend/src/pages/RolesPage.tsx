import { FormEvent, useEffect, useState } from "react";
import { BadgeCheck, Clock, Send, ShieldCheck, Store, Truck } from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
import { apiRequest } from "../lib/http";
import { PageIntro, SectionCard } from "../components/ui/PageSections";

interface RoleEntry {
  role: string;
  status: string;
  has_profile?: boolean;
}

interface RolesResponse {
  identity: {
    id: number;
    name: string;
    email: string;
    phone?: string | null;
    status: string;
    email_verified: boolean;
    phone_verified: boolean;
    roles: RoleEntry[];
  };
  active_role: string;
  roles: RoleEntry[];
}

interface RoleApplication {
  id: number;
  role: string;
  status: string;
  rejection_reason?: string | null;
  created_at?: string;
}

function label(value?: string) {
  return String(value || "").replace(/_/g, " ").toLowerCase();
}

function StatusBadge({ value }: { value?: string }) {
  const normalized = String(value || "").toUpperCase();
  const style =
    normalized === "APPROVED" || normalized === "ACTIVE"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
      : normalized === "PENDING" || normalized === "PENDING_VERIFICATION"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-600"
        : "border-danger/20 bg-danger/10 text-danger";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${style}`}>
      {label(normalized)}
    </span>
  );
}

export function RolesPage() {
  const { user, refreshUser } = useAuth();
  const [data, setData] = useState<RolesResponse | null>(null);
  const [applications, setApplications] = useState<RoleApplication[]>([]);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [baseArea, setBaseArea] = useState("");

  async function load() {
    try {
      const [roles, apps] = await Promise.all([
        apiRequest<RolesResponse>("/auth/roles"),
        apiRequest<RoleApplication[]>("/auth/applications"),
      ]);
      setData(roles);
      setApplications(apps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roles");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function apply(event: FormEvent<HTMLFormElement>, role: string) {
    event.preventDefault();
    setBusy(role);
    setError("");
    setFlash("");
    try {
      const details = role === "SELLER"
        ? { business_name: businessName.trim() || user?.name || "My business" }
        : { base_area: baseArea.trim() || "Dar es Salaam" };
      await apiRequest("/auth/applications", {
        method: "POST",
        body: { role, ...details },
      });
      setFlash(`${label(role)} application submitted for administrator review.`);
      setBusinessName("");
      setBaseArea("");
      await load();
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit application");
    } finally {
      setBusy("");
    }
  }

  const sellerRole = data?.roles.find((entry) => entry.role === "SELLER");
  const logisticsRole = data?.roles.find((entry) => entry.role === "LOGISTICS_PROVIDER");

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageIntro
        eyebrow="Identity and access"
        title="Roles and applications"
        description="Use one identity across customer, seller, logistics, and analytics workspaces. Additional roles require email verification and administrator approval."
      />

      {error ? <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-xs font-bold text-danger">{error}</div> : null}
      {flash ? <div className="rounded-2xl border border-accent/20 bg-accent/10 p-4 text-xs font-bold text-accent">{flash}</div> : null}

      <SectionCard title="Your identity" description="Verification and role status for the account you are signed in with.">
        {data ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-lg font-black text-white">
                {String(data.identity.name || "U").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-black text-text">{data.identity.name}</h3>
                <p className="truncate text-xs font-semibold text-text-muted">{data.identity.email}</p>
              </div>
              <StatusBadge value={data.identity.status} />
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${data.identity.email_verified ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600" : "border-amber-500/20 bg-amber-500/10 text-amber-600"}`}>
                Email {data.identity.email_verified ? "verified" : "pending"}
              </span>
              <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${data.identity.phone_verified ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600" : "border-amber-500/20 bg-amber-500/10 text-amber-600"}`}>
                Phone {data.identity.phone_verified ? "verified" : "pending"}
              </span>
              {data.roles.map((entry) => (
                <span key={entry.role} className="rounded-full border border-border bg-surface-soft px-3 py-1 text-[9px] font-black uppercase tracking-widest text-text-muted">
                  {label(entry.role)} · {label(entry.status)}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm font-semibold text-text-muted">Loading identity...</p>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SectionCard title="Sell on SokoLink" description="Apply for a business storefront and product catalogue.">
          <div className="space-y-4">
            <div className="flex items-center gap-3"><Store size={18} className="text-brand" /><span className="text-xs font-bold text-text">Seller workspace</span></div>
            {sellerRole ? (
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface-soft p-3">
                <span className="text-xs font-bold text-text-muted">Current status</span>
                <StatusBadge value={sellerRole.status} />
              </div>
            ) : (
              <form className="space-y-3" onSubmit={(event) => void apply(event, "SELLER")}>
                <input
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  className="modern-input"
                  placeholder="Business name"
                />
                <button className="btn-primary flex w-full items-center justify-center gap-2" disabled={busy === "SELLER"} type="submit">
                  <Send size={15} /> {busy === "SELLER" ? "Submitting..." : "Apply as seller"}
                </button>
              </form>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Deliver with SokoLink" description="Apply to join the logistics and delivery network.">
          <div className="space-y-4">
            <div className="flex items-center gap-3"><Truck size={18} className="text-brand" /><span className="text-xs font-bold text-text">Logistics workspace</span></div>
            {logisticsRole ? (
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface-soft p-3">
                <span className="text-xs font-bold text-text-muted">Current status</span>
                <StatusBadge value={logisticsRole.status} />
              </div>
            ) : (
              <form className="space-y-3" onSubmit={(event) => void apply(event, "LOGISTICS_PROVIDER")}>
                <input
                  value={baseArea}
                  onChange={(event) => setBaseArea(event.target.value)}
                  className="modern-input"
                  placeholder="Base area"
                />
                <button className="btn-primary flex w-full items-center justify-center gap-2" disabled={busy === "LOGISTICS_PROVIDER"} type="submit">
                  <Send size={15} /> {busy === "LOGISTICS_PROVIDER" ? "Submitting..." : "Apply for logistics"}
                </button>
              </form>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Application history" description="Track reviews and administrator decisions.">
        {applications.length === 0 ? (
          <p className="text-sm font-semibold text-text-muted">No applications submitted yet.</p>
        ) : (
          <div className="space-y-3">
            {applications.map((application) => (
              <div key={application.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface-soft p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  {application.status === "APPROVED" ? <BadgeCheck size={18} className="text-emerald-500" /> : application.status === "PENDING" ? <Clock size={18} className="text-amber-500" /> : <ShieldCheck size={18} className="text-text-muted" />}
                  <div>
                    <p className="text-sm font-bold text-text">{label(application.role)} role</p>
                    <p className="text-[11px] font-medium text-text-muted">
                      {application.rejection_reason ? `Reason: ${application.rejection_reason}` : "Awaiting or completed review"}
                    </p>
                  </div>
                </div>
                <StatusBadge value={application.status} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
