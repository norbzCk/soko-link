import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { FormEvent } from "react";
import { AlertTriangle, MessagesSquare, RefreshCw, Shield, Store, Users, X } from "lucide-react";
import { PageIntro, SectionCard, EmptyState } from "../components/ui/PageSections";
import { Button } from "../components/ui/Button";
import { Input, Select, Textarea } from "../components/ui/Field";
import {
  SellerError,
  SellerLoading,
  SellerNotice,
  SellerTabs,
  sellerStatusTone,
  useSellerResource,
} from "../features/seller/SellerUI";
import { apiRequest } from "../lib/http";
import { useAuth } from "../features/auth/AuthContext";
import { formatDate, formatDateTime, formatMoney } from "../lib/format";
import type {
  SellerCustomer,
  SellerDispute,
  SellerMessage,
  SellerOrder,
  SellerSettings,
  SellerThread,
} from "../types/seller";

type Tab = "customers" | "conversations" | "disputes" | "profile" | "security";

interface CustomerDetail {
  customer: {
    buyer_id: number;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    member_since?: string | null;
    orders: SellerOrder[];
    total_spent: number;
  };
}

interface ThreadResponse {
  thread: { id: number; sale_id?: number | null; order_id?: number | null; subject?: string | null };
  items: SellerMessage[];
}

interface DisputeDetail {
  dispute: SellerDispute & {
    buyer?: { id: number; name: string; phone?: string | null } | null;
    sale?: { id: number; product?: string | null; quantity?: number | null; unit_price: number; status: string } | null;
    messages: Array<{
      id: number;
      sender_type: string;
      sender_id: number;
      message?: string | null;
      evidence_url?: string | null;
      created_at?: string | null;
    }>;
  };
}

const profileFields = [
  ["category", "Category"],
  ["region", "Region"],
  ["area", "Area"],
  ["street", "Street"],
  ["shop_number", "Shop number"],
  ["operating_hours", "Operating hours"],
  ["shop_logo_url", "Shop logo URL"],
  ["profile_photo", "Profile photo URL"],
  ["website_url", "Website"],
  ["social_facebook", "Facebook"],
  ["social_instagram", "Instagram"],
  ["social_whatsapp", "WhatsApp"],
  ["social_x", "X"],
] as const;

export function SellerWorkspacePage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [tab, setTab] = useState<Tab>("customers");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [selectedThread, setSelectedThread] = useState<ThreadResponse | null>(null);
  const [messageText, setMessageText] = useState("");
  const [selectedDispute, setSelectedDispute] = useState<DisputeDetail | null>(null);
  const [disputeForm, setDisputeForm] = useState({ sale_id: "", reason: "", evidence_url: "" });
  const [disputeMessage, setDisputeMessage] = useState("");
  const [profile, setProfile] = useState<Record<string, string>>({ description: "" });
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [verification, setVerification] = useState({ document_type: "business_license", document_url: "" });
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "" });
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");

  const customers = useSellerResource<{ items: SellerCustomer[] }>("/seller/customers");
  const threads = useSellerResource<{ items: SellerThread[] }>("/seller/threads");
  const disputes = useSellerResource<{ items: SellerDispute[] }>("/seller/disputes");
  const settings = useSellerResource<SellerSettings>("/seller/settings");

  useEffect(() => {
    const business = settings.data?.business as unknown as Record<string, unknown> | undefined;
    if (!business) return;
    const next: Record<string, string> = { description: String(business.description || "") };
    for (const [field] of profileFields) {
      next[field] = typeof business[field] === "string" ? String(business[field]) : "";
    }
    setProfile(next);
    setAutoConfirm(Boolean((business as { auto_confirm?: boolean }).auto_confirm));
  }, [settings.data]);

  function clearMessages() {
    setError("");
    setFlash("");
  }

  function refresh() {
    void Promise.all([customers.reload(), threads.reload(), disputes.reload(), settings.reload()]);
  }

  async function openCustomer(customer: SellerCustomer) {
    clearMessages();
    try {
      const response = await apiRequest<CustomerDetail>(`/seller/customers/${customer.buyer_id}`);
      setSelectedCustomer(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load customer.");
    }
  }

  async function openThread(thread: SellerThread) {
    clearMessages();
    try {
      const response = await apiRequest<ThreadResponse>(`/seller/threads/${thread.id}/messages`);
      setSelectedThread(response);
      setMessageText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load conversation.");
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!selectedThread) return;
    setBusy(true);
    clearMessages();
    try {
      await apiRequest(`/seller/threads/${selectedThread.thread.id}/messages`, {
        method: "POST",
        body: { text: messageText, client_id: `seller-${Date.now()}` },
      });
      setMessageText("");
      await openThread(selectedThread.thread as SellerThread);
      await threads.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setBusy(false);
    }
  }

  async function openDispute(dispute: SellerDispute) {
    clearMessages();
    try {
      const response = await apiRequest<DisputeDetail>(`/seller/disputes/${dispute.id}`);
      setSelectedDispute(response);
      setDisputeMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dispute.");
    }
  }

  async function createDispute(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    clearMessages();
    try {
      await apiRequest("/seller/disputes", {
        method: "POST",
        body: {
          sale_id: Number(disputeForm.sale_id),
          reason: disputeForm.reason,
          evidence_url: disputeForm.evidence_url,
        },
      });
      setFlash("Dispute opened. The buyer has been notified.");
      setDisputeForm({ sale_id: "", reason: "", evidence_url: "" });
      await disputes.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open dispute.");
    } finally {
      setBusy(false);
    }
  }

  async function addDisputeMessage(event: FormEvent) {
    event.preventDefault();
    if (!selectedDispute) return;
    setBusy(true);
    clearMessages();
    try {
      await apiRequest(`/seller/disputes/${selectedDispute.dispute.id}/messages`, {
        method: "POST",
        body: { message: disputeMessage },
      });
      setDisputeMessage("");
      await openDispute(selectedDispute.dispute);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add dispute message.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    clearMessages();
    try {
      await apiRequest("/seller/profile", {
        method: "PUT",
        body: { ...profile, auto_confirm: autoConfirm },
      });
      setFlash("Storefront profile updated.");
      await settings.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update profile.");
    } finally {
      setBusy(false);
    }
  }

  async function submitVerification(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    clearMessages();
    try {
      await apiRequest("/seller/verification", { method: "POST", body: verification });
      setFlash("Verification documents submitted for review.");
      setVerification({ ...verification, document_url: "" });
      await settings.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit verification.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    clearMessages();
    try {
      await apiRequest("/seller/settings/password", { method: "POST", body: passwords });
      setPasswords({ current_password: "", new_password: "" });
      try {
        await logout();
      } finally {
        navigate("/login", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeSession(sessionId: number) {
    setBusy(true);
    clearMessages();
    try {
      await apiRequest(`/seller/settings/sessions/${sessionId}`, { method: "DELETE" });
      setFlash("Session revoked.");
      await settings.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke session.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeAll() {
    if (!window.confirm("Sign out all other sessions?")) return;
    setBusy(true);
    clearMessages();
    try {
      await apiRequest("/seller/settings/sessions/revoke-all", { method: "POST", body: {} });
      setFlash("Other sessions revoked.");
      await settings.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke sessions.");
    } finally {
      setBusy(false);
    }
  }

  const business = settings.data?.business;

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Workspace"
        title="Customers, conversations & settings"
        description="Manage buyer relationships, resolve disputes and keep your seller account secure."
        actions={
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={refresh}>
            Refresh
          </Button>
        }
      />

      {flash ? <SellerNotice>{flash}</SellerNotice> : null}
      {error ? <SellerError message={error} /> : null}

      <SellerTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "customers", label: "Customers", count: customers.data?.items.length },
          { id: "conversations", label: "Conversations", count: threads.data?.items.length },
          { id: "disputes", label: "Disputes", count: disputes.data?.items.length },
          { id: "profile", label: "Store profile" },
          { id: "security", label: "Security" },
        ]}
      />

      {tab === "customers" ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionCard title="Customers" description="Only buyers who have ordered from your shop are listed.">
            {customers.loading ? (
              <SellerLoading label="Loading customers..." />
            ) : customers.error ? (
              <SellerError message={customers.error} onRetry={customers.reload} />
            ) : customers.data && customers.data.items.length === 0 ? (
              <EmptyState title="No customers yet" description="Buyers appear after their first order." icon={<Users size={22} />} />
            ) : (
              <div className="space-y-2">
                {customers.data?.items.map((customer) => (
                  <button
                    key={customer.buyer_id}
                    type="button"
                    onClick={() => void openCustomer(customer)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                      selectedCustomer?.customer.buyer_id === customer.buyer_id
                        ? "border-brand bg-brand/5"
                        : "border-border bg-surface hover:border-brand/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{customer.name}</p>
                        <p className="text-xs text-text-muted">{customer.phone || customer.email || "No contact details"}</p>
                        <p className="text-xs text-text-muted">
                          {customer.orders} order(s) · {customer.completed_orders} completed · last {formatDate(customer.last_order_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatMoney(customer.total_spent)}</p>
                        {customer.average_rating ? <p className="text-xs text-amber-600">{customer.average_rating}/5</p> : null}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title={selectedCustomer ? selectedCustomer.customer.name : "Customer detail"}
            description={selectedCustomer ? `${selectedCustomer.customer.email || "no email"} · member since ${formatDate(selectedCustomer.customer.member_since)}` : "Select a customer to see order history."}
            action={selectedCustomer ? <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setSelectedCustomer(null)}>Close</Button> : undefined}
          >
            {!selectedCustomer ? (
              <p className="text-sm text-text-muted">Customer order history is limited to your shop.</p>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-border bg-surface-soft/40 p-3 text-sm">
                  <p><span className="text-text-muted">Spent:</span> {formatMoney(selectedCustomer.customer.total_spent)}</p>
                  <p><span className="text-text-muted">Phone:</span> {selectedCustomer.customer.phone || "—"}</p>
                  <p><span className="text-text-muted">Address:</span> {selectedCustomer.customer.address || "—"}</p>
                </div>
                {selectedCustomer.customer.orders.map((order) => (
                  <div key={order.id} className="rounded-xl border border-border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">#{order.id} · {order.product}</p>
                        <p className="text-xs text-text-muted">{order.quantity} × {formatMoney(order.unit_price)} · {formatDate(order.order_date)}</p>
                      </div>
                      <span className={`badge border ${sellerStatusTone(order.status)}`}>{order.status}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-text-muted">{order.payment_status || "payment not started"}</span>
                      <span className="font-semibold">{formatMoney(order.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {tab === "conversations" ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <SectionCard title="Order conversations" description="Messages are scoped to threads linked to your orders.">
            {threads.loading ? (
              <SellerLoading label="Loading conversations..." />
            ) : threads.error ? (
              <SellerError message={threads.error} onRetry={threads.reload} />
            ) : threads.data && threads.data.items.length === 0 ? (
              <EmptyState title="No conversations" description="Buyer messages will appear here." icon={<MessagesSquare size={22} />} />
            ) : (
              <div className="space-y-2">
                {threads.data?.items.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => void openThread(thread)}
                    className={`w-full rounded-xl border px-4 py-3 text-left ${
                      selectedThread?.thread.id === thread.id ? "border-brand bg-brand/5" : "border-border bg-surface"
                    }`}
                  >
                    <p className="font-semibold">{thread.subject || `Order #${thread.order_id || thread.sale_id || thread.id}`}</p>
                    <p className="truncate text-xs text-text-muted">{thread.last_message || "No messages yet"}</p>
                    <p className="text-[11px] text-text-muted">{formatDateTime(thread.last_message_at)}</p>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title={selectedThread?.thread.subject || "Conversation"}
            description={selectedThread ? `Thread #${selectedThread.thread.id}` : "Select a conversation."}
            action={selectedThread ? <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setSelectedThread(null)}>Close</Button> : undefined}
          >
            {!selectedThread ? (
              <p className="text-sm text-text-muted">Choose a thread to read and reply.</p>
            ) : (
              <div className="space-y-3">
                <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
                  {selectedThread.items.length === 0 ? (
                    <p className="text-sm text-text-muted">No messages yet.</p>
                  ) : selectedThread.items.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                        message.sender_role === "self"
                          ? "ml-auto bg-brand/10 text-text"
                          : "bg-surface-soft text-text"
                      }`}
                    >
                      <p className="text-[11px] font-semibold text-text-muted">
                        {message.sender_name || message.sender_role} · {formatDateTime(message.timestamp)}
                      </p>
                      <p>{message.text}</p>
                    </div>
                  ))}
                </div>
                <form className="space-y-2" onSubmit={(event) => void sendMessage(event)}>
                  <Textarea label="Message" rows={3} value={messageText} onChange={(event) => setMessageText(event.target.value)} />
                  <Button type="submit" size="sm" loading={busy} disabled={!messageText.trim()}>Send message</Button>
                </form>
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {tab === "disputes" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-6">
            <SectionCard title="Open a dispute" description="Use this when an order needs platform-mediated resolution.">
              <form className="space-y-3" onSubmit={(event) => void createDispute(event)}>
                <Input
                  label="Order ID"
                  type="number"
                  required
                  value={disputeForm.sale_id}
                  onChange={(event) => setDisputeForm({ ...disputeForm, sale_id: event.target.value })}
                />
                <Textarea
                  label="Issue"
                  rows={3}
                  required
                  value={disputeForm.reason}
                  onChange={(event) => setDisputeForm({ ...disputeForm, reason: event.target.value })}
                  hint="At least 10 characters."
                />
                <Input
                  label="Evidence URL (optional)"
                  value={disputeForm.evidence_url}
                  onChange={(event) => setDisputeForm({ ...disputeForm, evidence_url: event.target.value })}
                />
                <Button type="submit" loading={busy} disabled={disputeForm.reason.trim().length < 10} icon={<AlertTriangle size={14} />}>
                  Open dispute
                </Button>
              </form>
            </SectionCard>

            <SectionCard title="Disputes" description="Open and resolved cases linked to your orders.">
              {disputes.loading ? (
                <SellerLoading label="Loading disputes..." />
              ) : disputes.error ? (
                <SellerError message={disputes.error} onRetry={disputes.reload} />
              ) : disputes.data && disputes.data.items.length === 0 ? (
                <EmptyState title="No disputes" description="There are no disputes on your orders." icon={<AlertTriangle size={22} />} />
              ) : (
                <div className="space-y-2">
                  {disputes.data?.items.map((dispute) => (
                    <button
                      key={dispute.id}
                      type="button"
                      onClick={() => void openDispute(dispute)}
                      className={`w-full rounded-xl border px-4 py-3 text-left ${
                        selectedDispute?.dispute.id === dispute.id ? "border-brand bg-brand/5" : "border-border bg-surface"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">Dispute #{dispute.id} · Order #{dispute.sale_id}</p>
                          <p className="text-xs text-text-muted">{dispute.product || "order"} · {dispute.message_count} message(s)</p>
                          <p className="text-[11px] text-text-muted">{formatDate(dispute.created_at)}</p>
                        </div>
                        <span className={`badge border ${sellerStatusTone(dispute.status)}`}>{dispute.status}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard
            title={selectedDispute ? `Dispute #${selectedDispute.dispute.id}` : "Dispute detail"}
            description={selectedDispute ? `${selectedDispute.dispute.buyer?.name || "Buyer"} · order #${selectedDispute.dispute.sale_id}` : "Select a dispute to respond."}
            action={selectedDispute ? <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setSelectedDispute(null)}>Close</Button> : undefined}
          >
            {!selectedDispute ? (
              <p className="text-sm text-text-muted">Choose a dispute from the list.</p>
            ) : (
              <div className="space-y-3">
                {selectedDispute.dispute.resolution_details ? (
                  <div className="rounded-xl border border-border bg-surface-soft/40 p-3 text-sm">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Resolution</p>
                    <p>{selectedDispute.dispute.resolution_details}</p>
                  </div>
                ) : null}
                <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
                  {selectedDispute.dispute.messages.length === 0 ? (
                    <p className="text-sm text-text-muted">No messages yet.</p>
                  ) : selectedDispute.dispute.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${
                        message.sender_type === "seller" ? "ml-auto bg-brand/10" : "bg-surface-soft"
                      }`}
                    >
                      <p className="text-[11px] font-semibold text-text-muted">
                        {message.sender_type} · {formatDateTime(message.created_at)}
                      </p>
                      {message.message ? <p>{message.message}</p> : null}
                      {message.evidence_url ? (
                        <a className="text-xs text-brand underline" href={message.evidence_url} target="_blank" rel="noreferrer">Evidence</a>
                      ) : null}
                    </div>
                  ))}
                </div>
                {selectedDispute.dispute.status === "open" ? (
                  <form className="space-y-2" onSubmit={(event) => void addDisputeMessage(event)}>
                    <Textarea label="Response" rows={3} value={disputeMessage} onChange={(event) => setDisputeMessage(event.target.value)} />
                    <Button type="submit" size="sm" loading={busy} disabled={!disputeMessage.trim()}>Send response</Button>
                  </form>
                ) : (
                  <p className="text-sm text-text-muted">This dispute is resolved and no longer accepts messages.</p>
                )}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {settings.loading ? (
        <SellerLoading label="Loading settings..." />
      ) : settings.error ? (
        <SellerError message={settings.error} onRetry={settings.reload} />
      ) : tab === "profile" && business ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <SectionCard title="Storefront details" description="Legal business name, owner and phone are locked after verification.">
            <form className="space-y-3" onSubmit={(event) => void saveProfile(event)}>
              <div className="rounded-xl border border-border bg-surface-soft/40 p-3 text-sm">
                <p className="font-semibold">{business.business_name}</p>
                <p className="text-xs text-text-muted">{business.owner_name} · {business.phone} · {business.email || "no email"}</p>
                <p className="text-xs text-text-muted">Verification: {business.verification_status || "not submitted"}</p>
              </div>
              <Textarea
                label="Description"
                rows={4}
                value={profile.description || ""}
                onChange={(event) => setProfile({ ...profile, description: event.target.value })}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {profileFields.map(([field, label]) => (
                  <Input
                    key={field}
                    label={label}
                    value={profile[field] || ""}
                    onChange={(event) => setProfile({ ...profile, [field]: event.target.value })}
                  />
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={autoConfirm} onChange={(event) => setAutoConfirm(event.target.checked)} />
                Automatically confirm paid orders
              </label>
              <Button type="submit" loading={busy} icon={<Store size={14} />}>Save storefront</Button>
            </form>
          </SectionCard>

          <SectionCard title="Verification" description="Submit a clear document image or PDF link for administrator review.">
            <div className="mb-3 space-y-2">
              {business.verification_status ? (
                <p className="text-sm">Current status: <span className={`badge border ${sellerStatusTone(business.verification_status)}`}>{business.verification_status}</span></p>
              ) : null}
              {settings.data?.verification.documents.length ? settings.data.verification.documents.map((document) => (
                <div key={document.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span>{document.document_type?.replace(/_/g, " ")} · {formatDate(document.submitted_at)}</span>
                  <span className={`badge border ${sellerStatusTone(document.status)}`}>{document.status}</span>
                </div>
              )) : <p className="text-sm text-text-muted">No documents submitted yet.</p>}
            </div>
            <form className="space-y-3" onSubmit={(event) => void submitVerification(event)}>
              <Select
                label="Document type"
                value={verification.document_type}
                onChange={(event) => setVerification({ ...verification, document_type: event.target.value })}
              >
                <option value="business_license">Business licence</option>
                <option value="national_id">National ID</option>
                <option value="passport">Passport</option>
                <option value="tax_certificate">Tax certificate</option>
              </Select>
              <Input
                label="Document URL"
                required
                value={verification.document_url}
                onChange={(event) => setVerification({ ...verification, document_url: event.target.value })}
              />
              <Button type="submit" loading={busy} disabled={business.verification_status === "verified"}>Submit for review</Button>
            </form>
          </SectionCard>
        </div>
      ) : null}

      {tab === "security" && settings.data ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SectionCard title="Password" description="Changing your password revokes all refresh sessions, including this device.">
            <form className="space-y-3" onSubmit={(event) => void changePassword(event)}>
              <Input
                label="Current password"
                type="password"
                required
                value={passwords.current_password}
                onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })}
              />
              <Input
                label="New password"
                type="password"
                required
                minLength={8}
                value={passwords.new_password}
                onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })}
                hint="At least 8 characters."
              />
              <Button type="submit" loading={busy} icon={<Shield size={14} />}>Change password</Button>
            </form>
          </SectionCard>

          <SectionCard
            title="Sessions"
            description={`Multi-factor authentication: ${settings.data.security.mfa_status.replace(/_/g, " ")}.`}
            action={<Button size="sm" variant="secondary" loading={busy} onClick={() => void revokeAll()}>Sign out others</Button>}
          >
            {settings.data.sessions.length === 0 ? (
              <p className="text-sm text-text-muted">No active refresh sessions.</p>
            ) : (
              <div className="space-y-2">
                {settings.data.sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                    <div>
                      <p className="font-semibold">Session #{session.id} · {session.active_role || "seller"}</p>
                      <p className="text-xs text-text-muted">Started {formatDateTime(session.created_at)} · expires {formatDate(session.expires_at)}</p>
                    </div>
                    <Button size="sm" variant="ghost" loading={busy} onClick={() => void revokeSession(session.id)}>Revoke</Button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {tab === "security" && settings.data ? (
        <div className="rounded-xl border border-border bg-surface-soft/40 p-4 text-xs text-text-muted">
          {settings.data.security.note}
        </div>
      ) : null}
    </div>
  );
}
