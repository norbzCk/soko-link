import { FormEvent, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Users, 
  Mail, 
  Phone, 
  Trash2, 
  Plus, 
  X,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  ChevronRight,
  Activity
} from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
import { apiRequest } from "../lib/http";
import { EmptyState, PageIntro, SectionCard, StatCards } from "../components/ui/PageSections";

interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  created_at?: string;
  is_active?: boolean;
}

export function CustomersPage() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await apiRequest<Customer[]>("/superadmin/customers");
      setCustomers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "System sync failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || "").trim(),
      email: String(form.get("email") || "").trim().toLowerCase(),
      phone: String(form.get("phone") || "").trim() || null,
      password: "SokoLnkDefaultUser123!",
    };
    try {
      await apiRequest("/superadmin/customers", { method: "POST", body: payload });
      event.currentTarget.reset();
      setFlash("Entity successfully registered in the platform.");
      setShowAddForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Identity registration protocol failed");
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Permanently de-register this identity from the platform?")) return;
    try {
      await apiRequest(`/superadmin/customers/${id}`, { method: "DELETE" });
      setFlash("Identity decommissioned.");
      await load();
    } catch (err) {
      setError("Protocol failure during decommissioning.");
    }
  }

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone && c.phone.includes(search))
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <PageIntro
        eyebrow="Platform Identity Hub"
        title="Buyer Directory"
        description="Comprehensive management of the marketplace user-base. Oversee permissions, verify interactions, and manage identity lifecycle."
        actions={
          <button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn-primary !h-12 !px-6 flex items-center gap-2"
          >
            {showAddForm ? <X size={16} /> : <Plus size={16} />}
            {showAddForm ? "Cancel Protocol" : "Register Identity"}
          </button>
        }
      />

      <StatCards
        items={[
          { id: "total", label: "Global Users", value: customers.length, icon: <Users size={18} />, note: "Active participants" },
          { id: "verified", label: "Trust Score", value: "94.2%", icon: <ShieldCheck size={18} />, note: "Aggregate trust" },
          { id: "active", label: "Live Nodes", value: customers.filter(c => c.is_active !== false).length, icon: <Activity size={18} />, note: "Session active" },
        ]}
      />

      {error && <div className="p-4 bg-danger/10 text-danger rounded-2xl font-bold border border-danger/20 text-xs animate-soft-enter">{error}</div>}
      {flash && <div className="p-4 bg-accent/10 text-accent rounded-2xl font-bold border border-accent/20 text-xs animate-soft-enter">{flash}</div>}

      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <SectionCard title="Identity Provisioning" description="Register a new buyer node within the systematic marketplace.">
              <form className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">Legal Name</label>
                  <input name="name" className="modern-input" placeholder="Full Identity Name" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">Secure Email</label>
                  <input name="email" type="email" className="modern-input" placeholder="name@platform.com" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-muted ml-1">Comm Channel</label>
                  <input name="phone" className="modern-input" placeholder="+255..." />
                </div>
                <div className="lg:col-span-3 pt-4">
                  <button className="btn-primary w-full" type="submit">Synchronize Identity</button>
                </div>
              </form>
            </SectionCard>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4 bg-surface border border-border p-3 rounded-2xl shadow-sm">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search identity ledger..."
              className="w-full pl-11 pr-4 py-2.5 bg-surface-soft rounded-xl outline-none font-bold text-xs"
            />
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-surface-soft rounded-xl border border-transparent">
            <Filter size={14} className="text-text-muted" />
            <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">System Filters</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full py-20 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-brand/10 border-t-brand rounded-full animate-spin" />
              <p className="text-[10px] font-black uppercase tracking-widest text-text-muted animate-pulse">Scanning Identity Matrix...</p>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="col-span-full">
              <EmptyState 
                title="No matching identities" 
                description="The search protocol could not synchronize any records." 
                icon={<ShieldAlert size={32} />}
              />
            </div>
          ) : (
            filteredCustomers.map((customer) => (
              <motion.article 
                key={customer.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-card p-6 flex flex-col group hover:border-brand/40"
              >
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-[1.25rem] bg-brand/10 border border-brand/20 flex items-center justify-center text-brand font-black text-lg shrink-0">
                      {customer.name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display font-black text-lg text-text truncate group-hover:text-brand transition-colors">{customer.name}</h3>
                      <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mt-0.5">Protocol ID: {customer.id.toString().padStart(4, '0')}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button className="p-2 text-text-muted hover:text-brand transition-colors"><Mail size={16} /></button>
                    <button onClick={() => handleDelete(customer.id)} className="p-2 text-text-muted hover:text-danger transition-colors"><Trash2 size={16} /></button>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 text-xs font-bold text-text-muted group/item">
                    <Mail size={14} className="group-hover/item:text-brand transition-colors" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-bold text-text-muted group/item">
                    <Phone size={14} className="group-hover/item:text-brand transition-colors" />
                    <span>{customer.phone || "No secure comms"}</span>
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar size={12} className="text-text-muted" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                      {customer.created_at ? new Date(customer.created_at).toLocaleDateString() : "—"}
                    </span>
                  </div>
                  <button className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-brand hover:text-brand-strong transition-all">
                    Buyer Profile <ChevronRight size={12} />
                  </button>
                </div>
              </motion.article>
            ))
          )}
        </div>
      </div>
    </div>
   );
 }
