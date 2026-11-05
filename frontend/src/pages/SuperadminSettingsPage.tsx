import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { 
  ShieldCheck, 
  Settings, 
  UserCircle, 
  Lock, 
  Zap, 
  Truck, 
  ShoppingBag, 
  Activity,
  AlertTriangle,
  ChevronRight,
  Save,
  Fingerprint,
  FileSearch,
  Users,
  ShieldAlert
} from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
import { PageIntro, SectionCard, StatCards } from "../components/ui/PageSections";

export function SuperadminSettingsPage() {
  const { user } = useAuth();
  const [autoApproveSellers, setAutoApproveSellers] = useState(false);
  const [autoApproveLogistics, setAutoApproveLogistics] = useState(false);
  const [securityLock, setSecurityLock] = useState(true);
  const [flash, setFlash] = useState("");

  const accessSummary = useMemo(
    () => [
      { label: "Global Seller Verification", desc: "Full authority over merchant onboarding and trust levels.", icon: ShieldCheck },
      { label: "Logistics Mesh Control", desc: "Manage rider identities and system-wide delivery nodes.", icon: Truck },
      { label: "Economic Oversight", desc: "Real-time visibility into nexus-wide revenue and demand trends.", icon: Activity },
      { label: "Privilege Management", desc: "Configure high-level platform guardrails and operating rules.", icon: Lock },
    ],
    [],
  );

  function savePreferences() {
    localStorage.setItem(
      "superadmin_settings",
      JSON.stringify({ autoApproveSellers, autoApproveLogistics, securityLock }),
    );
    setFlash("Superadmin protocol updated on this local node.");
    setTimeout(() => setFlash(""), 3000);
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <PageIntro
        eyebrow="Nexus Governance"
        title="Admin Protocols"
        description="Configure high-level marketplace guardrails, verification policies, and global system operating rules."
      />

      <StatCards
        items={[
          { id: "scope", label: "Authority Scope", value: "FULL", icon: <ShieldCheck size={18} />, note: "Global Nexus clearance" },
          { id: "seller", label: "Seller Logic", value: autoApproveSellers ? "AUTO" : "MANUAL", icon: <ShoppingBag size={18} /> },
          { id: "logistics", label: "Rider Logic", value: autoApproveLogistics ? "AUTO" : "MANUAL", icon: <Truck size={18} /> },
          { id: "risk", label: "Risk Mode", value: securityLock ? "STRICT" : "LEAN", icon: <Zap size={18} /> },
        ]}
      />

      {flash && <div className="p-4 bg-accent/10 text-accent rounded-2xl font-bold border border-accent/20 text-xs animate-soft-enter">{flash}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <SectionCard title="Privilege Profile" description="Authorized operational reach for this superadmin identity.">
          <div className="space-y-6">
            <div className="flex items-center gap-5 p-6 rounded-[2rem] bg-brand/5 border border-brand/10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                <ShieldCheck size={80} />
              </div>
              <div className="w-16 h-16 rounded-2xl bg-brand flex items-center justify-center text-white font-black shadow-xl shrink-0 z-10">
                <Fingerprint size={32} />
              </div>
              <div className="z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand mb-1">Authenticated Operator</p>
                <h3 className="text-2xl font-display font-black text-text">{user?.name || "Global Controller"}</h3>
              </div>
            </div>

            <div className="space-y-3">
              {accessSummary.map((item) => (
                <div key={item.label} className="p-5 rounded-2xl bg-surface-soft/50 border border-border flex gap-4 group hover:border-brand/30 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center shrink-0 group-hover:bg-brand group-hover:text-white transition-all">
                    <item.icon size={18} />
                  </div>
                  <div>
                    <strong className="text-sm font-bold text-text block mb-0.5">{item.label}</strong>
                    <p className="text-xs text-text-muted font-medium">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <div className="space-y-8">
          <SectionCard title="Verification Protocol" description="Toggle automated review logic for platform stakeholders.">
            <div className="space-y-4">
              {[
                { label: "Automated Seller Clearance", desc: "Auto-verify sellers after batch validation.", checked: autoApproveSellers, onChange: setAutoApproveSellers, icon: ShoppingBag },
                { label: "Automated Rider Onboarding", desc: "Approve logistics nodes immediately after upload.", checked: autoApproveLogistics, onChange: setAutoApproveLogistics, icon: Truck },
                { label: "Strict High-Risk Filtering", desc: "Require manual review for all high-budget accounts.", checked: securityLock, onChange: setSecurityLock, icon: ShieldAlert }
              ].map((item) => (
                <label key={item.label} className="flex items-center justify-between p-5 rounded-2xl bg-surface border border-border group hover:border-brand/30 transition-all cursor-pointer">
                  <div className="flex gap-4 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${item.checked ? 'bg-brand text-white shadow-lg' : 'bg-surface-soft text-text-muted'}`}>
                      <item.icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-text block truncate">{item.label}</span>
                      <p className="text-[10px] font-medium text-text-muted truncate uppercase tracking-widest">{item.desc}</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => item.onChange(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-border text-brand focus:ring-brand ml-4"
                  />
                </label>
              ))}
            </div>
            <div className="pt-8 border-t border-border mt-8 flex justify-end">
              <button 
                onClick={savePreferences}
                className="btn-primary flex items-center gap-3 !px-10 h-14 active:scale-95 shadow-xl shadow-brand/20"
              >
                <Save size={18} />
                Save Protocol
              </button>
            </div>
          </SectionCard>

          <SectionCard title="System Intelligence">
            <div className="grid gap-4">
              <button className="w-full flex items-center justify-between p-5 rounded-2xl bg-surface-soft border border-border hover:bg-surface-strong transition-all group">
                <div className="flex items-center gap-4">
                  <FileSearch size={18} className="text-brand" />
                  <span className="text-sm font-bold">Audit Platform Logs</span>
                </div>
                <ChevronRight size={16} className="text-text-muted group-hover:translate-x-1 transition-all" />
              </button>
              <button className="w-full flex items-center justify-between p-5 rounded-2xl bg-surface-soft border border-border hover:bg-surface-strong transition-all group">
                <div className="flex items-center gap-4">
                  <Users size={18} className="text-brand" />
                  <span className="text-sm font-bold">Manage Admin Permissions</span>
                </div>
                <ChevronRight size={16} className="text-text-muted group-hover:translate-x-1 transition-all" />
              </button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
