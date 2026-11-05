import { FormEvent, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Settings, 
  Bell, 
  ShieldCheck, 
  Palette, 
  Trash2, 
  Lock, 
  Moon, 
  Sun, 
  Monitor,
  CheckCircle2,
  Mail,
  Smartphone,
  ShieldAlert,
  Download,
  LogOut,
  Zap,
  Globe,
  ChevronRight
} from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
import { useTheme } from "../features/auth/ThemeContext";
import { apiRequest } from "../lib/http";
import { PageIntro, SectionCard, StatCards } from "../components/ui/PageSections";

interface NotificationSettings {
  email_orders: boolean;
  email_promotions: boolean;
  email_updates: boolean;
  sms_enabled: boolean;
}

interface AccountSettings {
  two_factor_enabled: boolean;
  session_timeout: number;
  api_key_active: boolean;
}

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { theme, setTheme, effectiveTheme } = useTheme();
  const [notifications, setNotifications] = useState<NotificationSettings>({
    email_orders: true,
    email_promotions: false,
    email_updates: true,
    sms_enabled: false,
  });
  const [account, setAccount] = useState<AccountSettings>({
    two_factor_enabled: false,
    session_timeout: 30,
    api_key_active: false,
  });
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSubmitting] = useState(false);

  const role = String(user?.role || "");
  const isSeller = role === "seller";
  const isLogistics = role === "logistics";
  const isCustomer = role === "user";
  const isAdmin = ["admin", "super_admin", "owner"].includes(role);

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const data = await apiRequest<{
        notifications?: NotificationSettings;
        account?: AccountSettings;
      }>("/settings/", { method: "GET" });
      if (data.notifications) setNotifications(data.notifications);
      if (data.account) setAccount(data.account);
    } catch {
      // keep sensible defaults
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFlash("");
    setIsSubmitting(true);
    try {
      await apiRequest("/settings/", {
        method: "PUT",
        body: { notifications, account },
      });
      setFlash("Strategic preferences synchronized successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Protocol synchronization failure");
    } finally {
      setIsSubmitting(false);
    }
  }

  const preferenceSummary = [
    { id: "theme", label: "Active Visuals", value: effectiveTheme.toUpperCase(), icon: <Palette size={18} /> },
    { id: "alerts", label: "Active Nodes", value: Object.values(notifications).filter(Boolean).length, icon: <Bell size={18} /> },
    { id: "security", label: "Posture", value: account.two_factor_enabled ? "High" : "Standard", icon: <ShieldCheck size={18} /> },
    { id: "session", label: "Sync Cycle", value: `${account.session_timeout}m`, icon: <Monitor size={18} /> },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <PageIntro
        eyebrow="System Configuration"
        title="Settings"
        description="Unified control surface for account identity, visual preferences, and operational protocols."
      />

      <StatCards items={preferenceSummary} />

      {error && <div className="p-4 bg-danger/10 text-danger rounded-2xl font-bold border border-danger/20 text-xs animate-soft-enter">{error}</div>}
      {flash && <div className="p-4 bg-accent/10 text-accent rounded-2xl font-bold border border-accent/20 text-xs animate-soft-enter">{flash}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <SectionCard title="Appearance Protocol" description="Override system aesthetics with a manual theme override.">
            <div className="grid grid-cols-3 gap-4">
              {[
                { id: "light", icon: Sun, label: "Day" },
                { id: "dark", icon: Moon, label: "Night" },
                { id: "system", icon: Monitor, label: "Auto" }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id as any)}
                  className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all gap-3 ${
                    theme === t.id 
                      ? "bg-brand/5 border-brand text-brand shadow-lg shadow-brand/10" 
                      : "bg-surface border-border text-text-muted hover:border-brand/30 hover:text-text"
                  }`}
                >
                  <t.icon size={24} />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t.label}</span>
                </button>
              ))}
            </div>
          </SectionCard>

          <form className="space-y-8" onSubmit={saveSettings}>
            <SectionCard title="Telemetry Alerts" description="Configure secure notification vectors for system events.">
              <div className="space-y-4">
                {[
                  { id: "orders", label: "Fulfillment & Deployment Logs", checked: notifications.email_orders, key: "email_orders" },
                  { id: "promos", label: "Network Growth & Marketplace Deals", checked: notifications.email_promotions, key: "email_promotions" },
                  { id: "updates", label: "Platform Protocol Updates", checked: notifications.email_updates, key: "email_updates" },
                  { id: "sms", label: "Direct Critical SMS Alerts", checked: notifications.sms_enabled, key: "sms_enabled" }
                ].map((item) => (
                  <label key={item.id} className="flex items-center justify-between p-5 rounded-2xl bg-surface-soft/50 border border-border group hover:border-brand/30 transition-all cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${item.checked ? 'bg-brand/10 text-brand' : 'bg-surface border border-border text-text-muted'}`}>
                        {item.id === 'sms' ? <Smartphone size={18} /> : <Mail size={18} />}
                      </div>
                      <span className="text-sm font-bold text-text">{item.label}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => setNotifications(prev => ({ ...prev, [item.key]: e.target.checked }))}
                      className="w-5 h-5 rounded-lg border-border text-brand focus:ring-brand"
                    />
                  </label>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Identity Security" description="Manage cryptographic keys and session persistence.">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">Session Protocol (Minutes)</label>
                  <input
                    type="number"
                    min="5"
                    max="480"
                    value={account.session_timeout}
                    onChange={(e) => setAccount(prev => ({ ...prev, session_timeout: Number(e.target.value) }))}
                    className="modern-input"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center justify-between w-full p-4 rounded-2xl bg-surface-soft/50 border border-border group hover:border-brand/30 transition-all cursor-pointer">
                    <div className="flex items-center gap-3">
                      <Lock size={16} className={account.two_factor_enabled ? 'text-brand' : 'text-text-muted'} />
                      <span className="text-xs font-bold">Elevated Identity (2FA)</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={account.two_factor_enabled}
                      onChange={(e) => setAccount(prev => ({ ...prev, two_factor_enabled: e.target.checked }))}
                      className="w-5 h-5 rounded-lg border-border text-brand focus:ring-brand"
                    />
                  </label>
                </div>
              </div>
            </SectionCard>

            <div className="flex justify-end gap-4">
              <button className="btn-primary !px-12 w-full md:w-auto" disabled={isSaving} type="submit">
                {isSaving ? "Syncing..." : "Apply Preferences"}
              </button>
            </div>
          </form>
        </div>

        <aside className="space-y-8">
          <SectionCard title="Clearance Hub">
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-brand/5 border border-brand/10">
                <div className="w-12 h-12 rounded-xl bg-brand flex items-center justify-center text-white font-black shadow-lg">
                  {user?.role ? user.role[0].toUpperCase() : 'U'}
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-brand">{role.replace('_', ' ')} Node</p>
                  <h4 className="font-display font-black text-text truncate max-w-[140px]">{user?.name || "Standard Identity"}</h4>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-3">Role Capabilities</p>
                {[
                  { label: "Marketplace Execution", enabled: true },
                  { label: "Protocol Management", enabled: isAdmin },
                  { label: "Logistics Mesh Support", enabled: isLogistics || isAdmin },
                  { label: "Merchant Optimization", enabled: isSeller || isAdmin }
                ].map(cap => (
                  <div key={cap.label} className={`flex items-center justify-between p-3 rounded-xl border ${cap.enabled ? 'bg-surface border-border' : 'bg-surface-soft/30 border-transparent opacity-40'}`}>
                    <span className="text-xs font-bold text-text">{cap.label}</span>
                    {cap.enabled && <CheckCircle2 size={14} className="text-emerald-500" />}
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Lifecycle Management">
            <div className="space-y-3">
              <button className="w-full flex items-center justify-between p-4 rounded-xl bg-surface-soft hover:bg-surface-strong transition-all group">
                <div className="flex items-center gap-3">
                  <Download size={16} className="text-text-muted group-hover:text-brand" />
                  <span className="text-xs font-bold">Export Activity Payload</span>
                </div>
                <ChevronRight size={14} className="text-text-muted opacity-0 group-hover:opacity-100 transition-all" />
              </button>
              <button className="w-full flex items-center justify-between p-4 rounded-xl bg-danger/5 hover:bg-danger/10 transition-all group text-danger">
                <div className="flex items-center gap-3">
                  <Trash2 size={16} />
                  <span className="text-xs font-black uppercase tracking-widest">Decommission Node</span>
                </div>
              </button>
            </div>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
