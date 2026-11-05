import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BrandMark } from "./BrandMark";
import { CheckCircle2, ArrowLeft } from "lucide-react";

export function AuthScene({
  eyebrow,
  title,
  description,
  bullets,
  links,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  links: Array<{ to: string; label: string }>;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 md:p-8 selection:bg-brand/20 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-surface-soft/30 -z-10 skew-x-[-12deg] translate-x-1/4" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 bg-surface rounded-[2.5rem] shadow-premium overflow-hidden border border-border"
      >
        {/* Left Side: Branded Content */}
        <aside className="relative hidden lg:flex flex-col p-12 xl:p-16 overflow-hidden">
          <div className="absolute inset-0 bg-dark-bg" />
          <div className="absolute inset-0 opacity-30">
            <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-brand/30 blur-[120px]" />
            <div className="absolute -bottom-20 -right-20 h-80 w-80 rounded-full bg-accent/20 blur-[120px]" />
          </div>
          
          <div className="relative z-10 flex flex-col h-full">
            <BrandMark subtitle="Commerce Orchestration" />
            
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="mt-20 space-y-6"
            >
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white text-[10px] font-black uppercase tracking-widest border border-white/10">
                <span className="h-1 w-1 rounded-full bg-brand animate-pulse" />
                {eyebrow}
              </span>
              <h1 className="text-4xl xl:text-6xl font-display font-black text-white leading-[1.1] tracking-tight">
                {title}
              </h1>
              <p className="text-white/60 text-lg font-medium leading-relaxed max-w-md">
                {description}
              </p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="mt-16 space-y-6"
            >
              <h2 className="text-white/30 font-black text-xs uppercase tracking-[0.2em]">Platform Edge</h2>
              <ul className="grid gap-5">
                {bullets.map((item, i) => (
                  <motion.li 
                    key={item}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + (i * 0.1) }}
                    className="flex items-center gap-4 text-white/90 font-bold group cursor-default"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0 border border-white/10 group-hover:bg-brand/20 group-hover:border-brand/40 transition-all">
                      <CheckCircle2 size={20} className="text-brand" />
                    </div>
                    <span className="text-sm xl:text-base">{item}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>

            <div className="mt-auto pt-12 flex flex-wrap gap-8 border-t border-white/10">
              {links.map((item) => (
                <Link 
                  key={item.to} 
                  to={item.to}
                  className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 hover:text-white transition-colors flex items-center gap-2 group"
                >
                  {item.label}
                  <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
                </Link>
              ))}
            </div>
          </div>
        </aside>

        {/* Right Side: Auth Form */}
        <div className="p-8 md:p-16 lg:p-20 flex flex-col justify-center bg-surface">
          <div className="lg:hidden mb-12 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 text-text-muted font-bold text-sm">
              <ArrowLeft size={16} />
              Home
            </Link>
            <div className="h-10 w-10 bg-brand rounded-xl flex items-center justify-center shadow-lg">
              <BrandMark subtitle="" />
            </div>
          </div>
          
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="max-w-md mx-auto w-full"
          >
            {children}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

function ChevronRight({ size, className }: { size: number, className: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}
