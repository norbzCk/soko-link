import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { apiRequest } from "../../lib/http";
import { Button } from "../../components/ui/Button";
import { InlineNotice } from "../../components/ui/PageSections";

export function useSellerResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<T>(path);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this section.");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, setData, loading, error, reload: load, setError };
}

export function SellerLoading({ label = "Loading workspace..." }: { label?: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4">
      <Loader2 className="animate-spin text-brand" size={28} />
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted">{label}</p>
    </div>
  );
}

export function SellerError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <InlineNotice tone="error">{message}</InlineNotice>
      {onRetry ? (
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function SellerTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-border pb-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
            value === tab.id ? "bg-brand text-white" : "bg-surface-soft text-text-muted hover:text-text"
          }`}
        >
          {tab.label}
          {typeof tab.count === "number" ? (
            <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${value === tab.id ? "bg-white/20" : "bg-border/60"}`}>
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function SellerToolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function SellerNotice({ tone = "success", children }: { tone?: "info" | "success" | "warning" | "error"; children: ReactNode }) {
  return <InlineNotice tone={tone}>{children}</InlineNotice>;
}

export function sellerStatusTone(status?: string | null) {
  const normalized = String(status || "").toLowerCase();
  if (["approved", "active", "completed", "verified", "received", "delivered", "accepted"].includes(normalized)) {
    return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  }
  if (["pending", "scheduled", "processing", "requested", "submitted", "revised", "quoted", "confirmed"].includes(normalized)) {
    return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  }
  if (["rejected", "archived", "cancelled", "failed", "withdrawn", "expired"].includes(normalized)) {
    return "bg-danger/10 text-danger border-danger/20";
  }
  if (["draft", "paused"].includes(normalized)) {
    return "bg-surface-soft text-text-muted border-border";
  }
  return "bg-brand/10 text-brand border-brand/20";
}
