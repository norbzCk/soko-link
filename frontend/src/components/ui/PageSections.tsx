import type { ReactNode } from "react";
import { motion } from "framer-motion";

type PageIntroProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  badges?: ReactNode;
};

type StatItem = {
  id: string;
  label: string;
  value: ReactNode;
  note?: string;
  icon?: ReactNode;
};

export function PageIntro({ eyebrow, title, description, actions, badges }: PageIntroProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[1.25rem] border border-border bg-surface p-5 shadow-soft sm:p-6"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,90,167,0.06),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(239,159,47,0.06),transparent_38%)]" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-1.5">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">{title}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-text-muted">{description}</p>
          {badges ? <div className="flex flex-wrap gap-2 pt-1.5">{badges}</div> : null}
        </div>
        {actions ? <div className="relative flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </motion.section>
  );
}

export function StatCards({ items }: { items: StatItem[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item, i) => (
        <motion.article
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="stat-card"
        >
          <div className="flex items-center justify-between">
            <span>{item.label}</span>
            {item.icon && <div className="text-brand/50 group-hover:text-brand transition-colors">{item.icon}</div>}
          </div>
          <strong>{item.value}</strong>
          {item.note && <p className="text-[11px] font-bold text-text-muted/60 uppercase tracking-wider">{item.note}</p>}
        </motion.article>
      ))}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-card overflow-hidden${className ? ` ${className}` : ""}`}>
      <div className="flex flex-col gap-2 border-b border-border bg-surface-soft/30 px-4 py-3.5 sm:px-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-semibold tracking-tight text-text">{title}</h2>
          {description ? <p className="max-w-2xl text-xs text-text-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-border bg-surface-soft/40 px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface text-text-muted shadow-soft" aria-hidden="true">
        {icon || (
          <svg className="h-7 w-7" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 7.5A2.5 2.5 0 016.5 5h11A2.5 2.5 0 0120 7.5v9A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5v-9z" />
          </svg>
        )}
      </div>
      <div className="max-w-md space-y-1.5">
        <h3 className="font-display text-lg font-semibold tracking-tight text-text">{title}</h3>
        <p className="text-sm leading-relaxed text-text-muted">{description}</p>
      </div>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="glass-card overflow-hidden">
      <div className="border-b border-border bg-surface-soft/30 px-8 py-6">
        <h2 className="font-display text-2xl font-black tracking-tight text-text">{title}</h2>
      </div>
      <div className="p-8">{children}</div>
    </section>
  );
}

type InlineNoticeProps = {
  tone: "info" | "success" | "warning" | "error";
  children: ReactNode;
};

export function InlineNotice({ tone, children }: InlineNoticeProps) {
  const styles: Record<string, string> = {
    info: "bg-brand/10 text-brand border-brand/20",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    error: "bg-danger/10 text-danger border-danger/20",
  };

  return (
    <div className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold ${styles[tone]}`}>
      {children}
    </div>
  );
}

