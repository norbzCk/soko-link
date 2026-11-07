import type { ReactNode } from "react";

type Tone = "brand" | "accent" | "success" | "danger" | "neutral";

export function Badge({
  tone = "neutral",
  icon,
  children,
  className = "",
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`badge badge-${tone} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status?: string | null }) {
  const value = String(status || "").toLowerCase();
  let tone: Tone = "neutral";
  if (["delivered", "completed", "paid", "active", "approved", "verified", "success"].includes(value)) tone = "success";
  else if (["pending", "processing", "in transit", "dispatched", "confirmed", "watch", "low"].includes(value)) tone = "accent";
  else if (["cancelled", "failed", "rejected", "suspended", "critical", "out of stock"].includes(value)) tone = "danger";
  else if (["shipped", "picked"].includes(value)) tone = "brand";

  return <Badge tone={tone}>{status || "Unknown"}</Badge>;
}
