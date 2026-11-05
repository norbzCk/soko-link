import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/http";
import type { NotificationEntry } from "../types/domain";
import { useAuth } from "../features/auth/AuthContext";
import { EmptyState, InlineNotice, PageIntro, SectionCard, StatCards } from "../components/ui/PageSections";

interface NotificationResponse {
  items: NotificationEntry[];
  unread_count: number;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Just now";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function severityClass(value?: string) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "success") return "ok";
  if (normalized === "warning") return "warn";
  if (normalized === "error") return "danger";
  return "ok";
}

export function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [loading, setLoading] = useState(true);

  const isSeller = String(user?.role || "") === "seller";

  useEffect(() => {
    void load();
  }, [user?.role]);

  useEffect(() => {
    if (!flash) return undefined;
    const timer = window.setTimeout(() => setFlash(""), 2400);
    return () => window.clearTimeout(timer);
  }, [flash]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const endpoints = ["/notifications"];
      if (isSeller) {
        endpoints.push("/business/notifications");
      }

      const results = await Promise.all(
        endpoints.map((ep) => apiRequest<NotificationResponse>(ep).catch(() => ({ items: [], unread_count: 0 }))),
      );

      const allItems = results.flatMap((result) => result.items || []);
      const totalUnread = results.reduce((acc, result) => acc + Number(result.unread_count || 0), 0);

      allItems.sort((a, b) => {
        const da = new Date(a.created_at || 0).getTime();
        const db = new Date(b.created_at || 0).getTime();
        return db - da;
      });

      setNotifications(allItems.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);

      if (totalUnread > 0) {
        try {
          await apiRequest("/notifications/read-all", { method: "POST" });
          window.dispatchEvent(new CustomEvent("notifications-read"));
        } catch {
          setNotifications(allItems);
          setUnreadCount(totalUnread);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: NotificationEntry["id"]) {
    setError("");
    setFlash("");
    const previousNotifications = notifications;
    const nextNotifications = notifications.map((item) => (item.id === id ? { ...item, is_read: true } : item));
    const nextUnreadCount = nextNotifications.filter((item) => !item.is_read).length;

    setNotifications(nextNotifications);
    setUnreadCount(nextUnreadCount);

    try {
      await apiRequest(`/notifications/${id}/read`, { method: "POST" });
      setFlash("Notification marked as read.");
    } catch (err) {
      setNotifications(previousNotifications);
      setUnreadCount(previousNotifications.filter((item) => !item.is_read).length);
      setError(err instanceof Error ? err.message : "Failed to update notification");
    }
  }

  async function markAllRead() {
    setError("");
    setFlash("");
    const previousNotifications = notifications;
    const nextNotifications = notifications.map((item) => ({ ...item, is_read: true }));

    setNotifications(nextNotifications);
    setUnreadCount(0);

    try {
      await apiRequest("/notifications/read-all", { method: "POST" });
      setFlash("All notifications marked as read.");
    } catch (err) {
      setNotifications(previousNotifications);
      setUnreadCount(previousNotifications.filter((item) => !item.is_read).length);
      setError(err instanceof Error ? err.message : "Failed to update notifications");
    }
  }

  return (
    <div className="space-y-6 animate-soft-enter">
      <PageIntro
        eyebrow="Notifications"
        title="Alerts, emails, and account activity"
        description="Keep every order, payment, delivery, and account signal in one production-ready inbox with cleaner prioritization and stronger mobile readability."
        badges={
          <>
            <span className="inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
              {String(user?.role || "user").replace(/_/g, " ")} workspace
            </span>
            <span className="inline-flex rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-brand">
              {unreadCount} unread
            </span>
          </>
        }
        actions={
          <button className="btn-secondary" type="button" onClick={markAllRead} disabled={!unreadCount}>
            Mark all read
          </button>
        }
      />

      <StatCards
        items={[
          { id: "total", label: "Total notifications", value: loading ? "..." : notifications.length, note: "Combined account and role-specific events" },
          { id: "unread", label: "Unread items", value: loading ? "..." : unreadCount, note: unreadCount ? "Still needs your attention" : "Inbox is clear" },
          { id: "seller-feed", label: "Seller feed", value: isSeller ? "Enabled" : "Standard", note: isSeller ? "Business alerts are merged in" : "Showing account-level updates" },
        ]}
      />

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {flash ? <InlineNotice tone="success">{flash}</InlineNotice> : null}

      <SectionCard
        title="Notification inbox"
        description="The feed is grouped into clear cards so every message stays readable and actionable across screen sizes."
      >
        {loading ? <p className="text-sm text-slate-500 dark:text-slate-400">Loading notifications...</p> : null}
        {!loading && !notifications.length ? (
          <EmptyState
            title="No notifications yet"
            description="Your inbox will start filling as orders move, payments post, and platform events occur."
          />
        ) : null}

        {!loading && notifications.length ? (
          <div className="space-y-4">
            {notifications.map((item) => (
              <article
                key={item.id}
                className="rounded-[1.5rem] border border-slate-200/80 bg-slate-50/70 p-5 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-900/70"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="font-display text-lg font-black tracking-tight text-slate-950 dark:text-white">{item.title}</strong>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${
                          severityClass(item.severity) === "ok"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : severityClass(item.severity) === "warn"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                        }`}
                      >
                        {item.is_read ? "Read" : "New"}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{item.message}</p>
                    <div className="flex flex-wrap gap-2">
                      <MetaPill value={formatDateTime(item.created_at)} />
                      <MetaPill value={item.type || "system"} />
                      {item.email_status ? <MetaPill value={`Email: ${item.email_status}`} /> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {item.action_href ? (
                      <Link className="btn-secondary" to={item.action_href}>
                        Open page
                      </Link>
                    ) : null}
                    {!item.is_read ? (
                      <button className="btn-primary" type="button" onClick={() => void markRead(item.id)}>
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

function MetaPill({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
      {value}
    </span>
  );
}
