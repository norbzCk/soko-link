import { FormEvent, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Truck, 
  ShieldCheck, 
  Clock, 
  MapPin, 
  Mail, 
  Phone, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  X,
  Search,
  Filter,
  ArrowRight,
  Package
} from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
import { apiRequest } from "../lib/http";
import { EmptyState, PageIntro, SectionCard, StatCards } from "../components/ui/PageSections";
import type { Provider } from "../types/domain";

function canManage(role?: string) {
  return ["admin", "super_admin", "owner", "seller"].includes(String(role || ""));
}

export function ProvidersPage() {
  const { user } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest<Provider[]>("/providers/");
      setProviders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || "").trim(),
      location: String(form.get("location") || "").trim() || null,
      email: String(form.get("email") || "").trim() || null,
      phone: String(form.get("phone") || "").trim() || null,
      response_time: String(form.get("response_time") || "").trim() || null,
      min_order_qty: String(form.get("min_order_qty") || "").trim() || null,
      verified: Boolean(form.get("verified")),
    };
    try {
      await apiRequest("/providers/", { method: "POST", body: payload });
      event.currentTarget.reset();
      setFlash("Strategic provider successfully synchronized.");
      setShowAddForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Protocol failed to save provider");
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Disconnect this provider from the network?")) return;
    try {
      await apiRequest(`/providers/${id}`, { method: "DELETE" });
      setFlash("Provider disconnected.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnection failed");
    }
  }

  if (!canManage(user?.role)) {
    return (
      <div className="p-8">
        <PageIntro 
          eyebrow="Access Denied"
          title="Security Protocol"
          description="Your account level does not have the clearance to manage marketplace providers."
        />
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-7xl mx-auto">
      <PageIntro
        eyebrow="Supplier Mesh"
        title="Network Partners"
        description="Global management of verified suppliers, fulfillment agents, and strategic manufacturing partners."
        actions={
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-primary flex items-center gap-2"
          >
            {showAddForm ? <X size={18} /> : <Plus size={18} />}
            {showAddForm ? "Cancel Protocol" : "Onboard Provider"}
          </button>
        }
      />

      <StatCards
        items={[
          { id: "all", label: "Total Node Count", value: providers.length, icon: <Truck size={18} />, note: "Active suppliers" },
          { id: "verified", label: "Trust Index", value: providers.filter(p => p.verified).length, icon: <ShieldCheck size={18} />, note: "Verified partners" },
          { id: "reachable", label: "Sync Status", value: providers.filter(p => p.email && p.phone).length, icon: <Package size={18} />, note: "Full contact visibility" },
        ]}
      />

      {error && <div className="p-5 bg-danger/10 text-danger rounded-[2rem] font-bold border border-danger/20 animate-soft-enter">{error}</div>}
      {flash && <div className="p-5 bg-accent/10 text-accent rounded-[2rem] font-bold border border-accent/20 animate-soft-enter">{flash}</div>}

      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <SectionCard title="Provider Onboarding" description="Define strategic partner parameters and trust levels.">
              <form className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Partner Identity</label>
                  <input name="name" className="modern-input h-14" placeholder="Business or Entity Name" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Geographic Base</label>
                  <input name="location" className="modern-input h-14" placeholder="Region or Hub Area" />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Secure Email</label>
                  <input name="email" type="email" className="modern-input h-14" placeholder="partner@network.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Contact Phone</label>
                  <input name="phone" className="modern-input h-14" placeholder="+255..." />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Response Protocol</label>
                  <input name="response_time" className="modern-input h-14" placeholder="E.g. < 4 Hours" />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase tracking-widest text-text-muted ml-1">Minimum Sourcing</label>
                  <input name="min_order_qty" className="modern-input h-14" placeholder="E.g. 100 Units" />
                </div>
                <div className="lg:col-span-3 pt-4">
                  <div className="flex items-center gap-4 p-4 rounded-2xl bg-surface-soft border border-border">
                    <input type="checkbox" name="verified" id="v-check" className="w-5 h-5 rounded-lg border-border text-brand focus:ring-brand" />
                    <label htmlFor="v-check" className="text-sm font-bold text-text cursor-pointer">Grant Instant Verification Badge (Trust Level A)</label>
                  </div>
                  <button className="btn-primary w-full mt-6" type="submit">Synchronize Partner Node</button>
                </div>
              </form>
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>

      <SectionCard title="Partner Directory" description="Live synchronization of the global supplier network.">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-6">
            <div className="w-16 h-16 border-4 border-brand/10 border-t-brand rounded-full animate-spin" />
            <p className="font-black text-[11px] uppercase tracking-[0.3em] text-text-muted animate-pulse">Syncing Network Nodes...</p>
          </div>
        ) : !providers.length ? (
          <EmptyState
            title="No partner nodes"
            description="The supplier mesh is currently empty. Initiate onboarding to populate the network."
            icon={<Truck size={32} />}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {providers.map((provider) => (
              <motion.article 
                key={provider.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-card p-8 flex flex-col h-full group hover:border-brand/40"
              >
                <div className="flex items-start justify-between gap-6 mb-8">
                  <div className="min-w-0">
                    <h3 className="font-display font-black text-2xl text-text truncate group-hover:text-brand transition-colors">{provider.name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-text-muted">
                      <MapPin size={14} className="text-brand" />
                      <span className="text-xs font-bold">{provider.location || "Base Pending"}</span>
                    </div>
                  </div>
                  <div className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${provider.verified ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                    {provider.verified ? 'Verified' : 'Pending'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  {[
                    { val: provider.response_time || 'N/A', icon: Clock, label: 'Response' },
                    { val: provider.min_order_qty || 'N/A', icon: Package, label: 'Min Order' }
                  ].map((item, i) => (
                    <div key={i} className="p-3 rounded-xl bg-surface-soft border border-border">
                      <span className="text-[9px] font-black uppercase tracking-widest text-text-muted block mb-1">{item.label}</span>
                      <div className="flex items-center gap-2">
                        <item.icon size={12} className="text-brand" />
                        <span className="text-xs font-black text-text">{item.val}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 pt-6 border-t border-border mt-auto">
                  <div className="flex items-center gap-3 text-text-muted group/item cursor-pointer">
                    <Mail size={16} className="group-hover/item:text-brand transition-colors" />
                    <span className="text-xs font-bold truncate">{provider.email || "No Secure Email"}</span>
                  </div>
                  <div className="flex items-center gap-3 text-text-muted group/item cursor-pointer">
                    <Phone size={16} className="group-hover/item:text-brand transition-colors" />
                    <span className="text-xs font-bold">{provider.phone || "No Secure Phone"}</span>
                  </div>
                </div>

                <div className="mt-8 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Node #{provider.id}</span>
                  <button 
                    onClick={() => handleDelete(provider.id)}
                    className="w-10 h-10 rounded-xl bg-danger/5 text-danger flex items-center justify-center hover:bg-danger hover:text-white transition-all shadow-sm"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
