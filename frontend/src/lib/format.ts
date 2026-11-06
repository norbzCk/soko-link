import { env } from "../config/env";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80";

/**
 * Format a numeric amount into Tanzanian Shillings (TZS).
 */
export function formatMoney(value?: number | null): string {
  const num = Number(value || 0);
  return `TZS ${num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format a large amount into a human-readable compact notation (e.g. TZS 1.5M).
 */
export function formatMoneyCompact(value?: number | null): string {
  const num = Number(value || 0);
  return `TZS ${num.toLocaleString(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  })}`;
}

/**
 * Resolve an image URL from the API backend or external host.
 */
export function resolveImageUrl(url?: string | null, fallback = FALLBACK_IMAGE): string {
  const raw = String(url || "").trim();
  if (!raw) return fallback;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("data:")) return raw;
  if (raw.startsWith("/")) return `${env.apiBase}${raw}`;
  return `${env.apiBase}/${raw.replace(/^\/+/, "")}`;
}

/**
 * Generate 1-2 character uppercase initials from a name string.
 */
export function getInitials(name?: string | null): string {
  const text = String(name || "User").trim();
  if (!text) return "U";
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Format an ISO date string into readable date.
 */
export function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, options ?? {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format an ISO date string into readable date + time.
 */
export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Resolve a backend-generated graph/chart URL with cache-busting.
 */
export function resolveGraphUrl(path?: string | null): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${env.apiBase}${path}?t=${Date.now()}`;
  return `${env.apiBase}/${path.replace(/^\/+/, "")}?t=${Date.now()}`;
}
