import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BrandMark } from "./BrandMark";
import logoUrl from "../assets/sokolink-logo.png";
import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg p-3 selection:bg-brand/20 sm:p-6 lg:p-8">
      <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-brand/10 blur-[130px]" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-accent/10 blur-[130px]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[1.5rem] border border-border bg-surface shadow-premium lg:grid-cols-[0.92fr_1.08fr]"
      >
        {/* Brand panel */}
        <aside className="relative hidden overflow-hidden bg-[#08192b] p-9 lg:flex lg:flex-col xl:p-11">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-16 -top-16 h-72 w-72 rounded-full bg-brand/30 blur-[110px]" />
            <div className="absolute -bottom-20 -right-16 h-72 w-72 rounded-full bg-accent/20 blur-[110px]" />
            <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:36px_36px]" />
          </div>

          <div className="relative z-10 flex h-full flex-col">
            <Link to="/" className="inline-flex w-fit items-center gap-2.5 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 p-1.5 ring-1 ring-white/15">
                <img src={logoUrl} alt="" className="h-full w-full object-contain" />
              </span>
              <span className="font-display text-lg font-bold tracking-tight">Soko-Link</span>
            </Link>

            <div className="mt-14">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                {eyebrow}
              </span>
              <h1 className="mt-4 max-w-sm font-display text-[2rem] font-bold leading-[1.15] tracking-tight text-white xl:text-[2.4rem]">
                {title}
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/60">{description}</p>
            </div>

            <ul className="mt-8 space-y-3">
              {bullets.map((item, index) => (
                <motion.li
                  key={item}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + index * 0.08 }}
                  className="flex items-start gap-2.5 text-sm font-medium text-white/80"
                >
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-brand" />
                  <span>{item}</span>
                </motion.li>
              ))}
            </ul>

            <div className="mt-auto pt-10">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-[11px] font-medium text-white/55">
                <ShieldCheck size={15} className="text-brand" />
                Secured sessions · encrypted credentials · role-based access
              </div>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-4">
                {links.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 transition-colors hover:text-white"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Form panel */}
        <div className="flex flex-col bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 lg:hidden">
            <BrandMark subtitle="" />
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
            >
              <ArrowLeft size={14} />
              Home
            </Link>
          </div>

          <div className="flex flex-1 items-start justify-center px-5 py-8 sm:px-8 sm:py-10 lg:px-11 lg:py-12">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="w-full max-w-md"
            >
              {children}
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
