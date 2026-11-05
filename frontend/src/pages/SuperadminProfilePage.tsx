import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { 
  ShieldCheck, 
  Mail, 
  Fingerprint, 
  Activity, 
  Lock, 
  UserCircle, 
  Zap,
  Globe,
  Settings
} from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
import { apiRequest } from "../lib/http";
import { EmptyState, PageIntro, SectionCard, StatCards } from "../components/ui/PageSections";

interface SuperadminUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export function SuperadminProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<SuperadminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    try {
      const data = await apiRequest<SuperadminUser>("/superadmin/me");
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nexus sync failure");
      if (user) {
        setProfile({
          id: user.id ?? 0,
          name: user.name || "",
          email: user.email || "",
          role: user.role || "super_admin",
        });
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-4 border-brand/10 border-t-brand rounded-full animate-spin" />
        <p className="font-black text-[10px] uppercase tracking-[0.3em] text-text-muted animate-pulse">Syncing Admin Node...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-8 max-w-7xl mx-auto">
        <EmptyState title="No profile data available" description="Your superadmin identity will appear here once the account data is available." />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <PageIntro
        eyebrow="Platform Controller"
        title="Admin Identity"
        description="Highest-privilege identity profile. Manage your operational credentials and oversee your administrative reach."
      />

      <StatCards
        items={[
          { id: "id", label: "Protocol ID", value: profile.id.toString().padStart(4, '0'), icon: <Fingerprint size={18} />, note: "System unique" },
          { id: "role", label: "Access Tier", value: (profile.role || "super_admin").replace('_', ' ').toUpperCase(), icon: <ShieldCheck size={18} />, note: "Global scope" },
          { id: "activity", label: "Node State", value: "NOMINAL", icon: <Activity size={18} />, note: "Connection verified" },
        ]}
      />

      {error && <div className="p-4 bg-danger/10 text-danger rounded-2xl font-bold border border-danger/20 text-xs animate-soft-enter">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <SectionCard title="Identity Node" description="Authenticated parameters for global marketplace oversight.">
             <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
                <div className="w-32 h-32 rounded-[2.5rem] bg-brand flex items-center justify-center text-white font-black text-4xl shadow-xl shadow-brand/20 shrink-0">
                  {profile.name[0]?.toUpperCase() || "A"}
                </div>
                <div className="flex-1 text-center md:text-left space-y-4">
                   <div>
                      <h3 className="text-3xl font-display font-black text-text">{profile.name || "Super Admin"}</h3>
                      <p className="text-sm font-bold text-text-muted mt-1 uppercase tracking-widest">{profile.role.replace('_', ' ')} tier</p>
                   </div>
                   <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-4 border-t border-border">
                      <div className="flex items-center gap-2 text-xs font-bold text-text">
                         <Mail size={14} className="text-brand" />
                         {profile.email}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-bold text-text">
                         <Globe size={14} className="text-brand" />
                         Nexus Protocol V4
                      </div>
                   </div>
                </div>
             </div>
          </SectionCard>

          <SectionCard title="Operational Reach" description="Authorized system modules for this clearance level.">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "Global User Matrix", icon: UserCircle, access: "GRANTED" },
                  { label: "Economic Oversight", icon: Zap, access: "GRANTED" },
                  { label: "System Preferences", icon: Settings, access: "GRANTED" },
                  { label: "Trust Protocols", icon: Lock, access: "GRANTED" }
                ].map((mod) => (
                  <div key={mod.label} className="p-5 rounded-2xl bg-surface-soft/50 border border-border flex items-center justify-between group hover:border-brand/40 transition-all">
                     <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center text-text-muted group-hover:bg-brand group-hover:text-white transition-all">
                           <mod.icon size={18} />
                        </div>
                        <span className="text-sm font-bold">{mod.label}</span>
                     </div>
                     <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{mod.access}</span>
                  </div>
                ))}
             </div>
          </SectionCard>
        </div>

        <aside className="space-y-8">
           <article className="glass-card p-8 bg-dark-bg text-white border-none relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform duration-700">
                <ShieldCheck size={80} />
              </div>
              <div className="relative z-10 space-y-6">
                 <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Security Status</span>
                    <h3 className="text-2xl font-display font-black tracking-tight">Post-Auth Active</h3>
                 </div>
                 <div className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md space-y-4">
                    <div className="flex justify-between items-center">
                       <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">TLS 1.3</span>
                       <span className="text-[10px] font-black text-emerald-400">SECURE</span>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Protocol</span>
                       <span className="text-[10px] font-black text-emerald-400">STRICT</span>
                    </div>
                 </div>
                 <button className="btn-primary w-full !h-12 !text-[9px] shadow-brand/40">Rotate Admin Keys</button>
              </div>
           </article>
        </aside>
      </div>
    </div>
  );
}
