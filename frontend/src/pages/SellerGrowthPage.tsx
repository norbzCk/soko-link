import { useState } from "react";
import type { FormEvent } from "react";
import { BarChart3, Download, Megaphone, MessagesSquare, RefreshCw, Star, X } from "lucide-react";
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
import { getStoredToken } from "../features/auth/authStorage";
import { env } from "../config/env";
import { formatDate, formatMoney } from "../lib/format";
import type {
  SellerAnalytics,
  SellerProduct,
  SellerPromotion,
  SellerQuotation,
  SellerReview,
  SellerReviewResponse,
  SellerRfq,
} from "../types/seller";

type Tab = "rfqs" | "quotations" | "promotions" | "reviews" | "analytics";

const nowLocal = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const inDaysLocal = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export function SellerGrowthPage() {
  const [tab, setTab] = useState<Tab>("rfqs");
  const [selectedRfq, setSelectedRfq] = useState<SellerRfq | null>(null);
  const [quote, setQuote] = useState({ unit_price: "", lead_time_days: "", valid_until: inDaysLocal(14), notes: "" });
  const [question, setQuestion] = useState("");
  const [promo, setPromo] = useState({
    product_id: "",
    name: "",
    discount_type: "percent",
    discount_value: "",
    starts_at: nowLocal(),
    ends_at: inDaysLocal(14),
  });
  const [replyFor, setReplyFor] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [reportFor, setReportFor] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [range, setRange] = useState("30");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");

  const rfqs = useSellerResource<{ items: SellerRfq[] }>("/seller/rfqs");
  const quotations = useSellerResource<{ items: SellerQuotation[] }>("/seller/quotations");
  const promotions = useSellerResource<{ items: SellerPromotion[] }>("/seller/promotions");
  const reviews = useSellerResource<SellerReviewResponse>("/seller/reviews?limit=100");
  const products = useSellerResource<{ items: SellerProduct[] }>("/seller/products?status=approved&limit=200");
  const analytics = useSellerResource<SellerAnalytics>(`/seller/analytics?range_days=${range}`);

  async function reloadAll() {
    await Promise.all([
      rfqs.reload(),
      quotations.reload(),
      promotions.reload(),
      reviews.reload(),
      products.reload(),
      analytics.reload(),
    ]);
  }

  function clearMessages() {
    setError("");
    setFlash("");
  }

  function openQuote(rfq: SellerRfq) {
    setSelectedRfq(rfq);
    setQuestion("");
    clearMessages();
    const existing = rfq.my_quotation;
    setQuote({
      unit_price: existing ? String(existing.unit_price) : "",
      lead_time_days: existing?.lead_time_days != null ? String(existing.lead_time_days) : "",
      valid_until: existing?.valid_until ? existing.valid_until.slice(0, 16) : inDaysLocal(14),
      notes: existing?.notes || "",
    });
  }

  async function submitQuote(event: FormEvent) {
    event.preventDefault();
    if (!selectedRfq) return;
    setBusy(true);
    clearMessages();
    try {
      await apiRequest(`/seller/rfqs/${selectedRfq.id}/quotations`, {
        method: "POST",
        body: {
          unit_price: Number(quote.unit_price),
          lead_time_days: quote.lead_time_days === "" ? null : Number(quote.lead_time_days),
          valid_until: new Date(quote.valid_until).toISOString(),
          notes: quote.notes,
        },
      });
      setFlash("Quotation submitted. You can revise it while the RFQ is open.");
      setSelectedRfq(null);
      await Promise.all([rfqs.reload(), quotations.reload(), analytics.reload()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit quotation.");
    } finally {
      setBusy(false);
    }
  }

  async function askQuestion(event: FormEvent) {
    event.preventDefault();
    if (!selectedRfq) return;
    setBusy(true);
    clearMessages();
    try {
      await apiRequest(`/seller/rfqs/${selectedRfq.id}/clarifications`, {
        method: "POST",
        body: { question },
      });
      setFlash("Clarification question submitted to the buyer.");
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit question.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(quotation: SellerQuotation) {
    if (!window.confirm("Withdraw this quotation?")) return;
    setBusy(true);
    clearMessages();
    try {
      await apiRequest(`/seller/quotations/${quotation.id}/withdraw`, { method: "POST" });
      setFlash("Quotation withdrawn.");
      await Promise.all([rfqs.reload(), quotations.reload()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not withdraw quotation.");
    } finally {
      setBusy(false);
    }
  }

  async function createPromotion(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    clearMessages();
    try {
      await apiRequest("/seller/promotions", {
        method: "POST",
        body: {
          product_id: Number(promo.product_id),
          name: promo.name,
          discount_type: promo.discount_type,
          discount_value: Number(promo.discount_value),
          starts_at: new Date(promo.starts_at).toISOString(),
          ends_at: new Date(promo.ends_at).toISOString(),
        },
      });
      setFlash("Promotion created.");
      setPromo({
        product_id: "",
        name: "",
        discount_type: "percent",
        discount_value: "",
        starts_at: nowLocal(),
        ends_at: inDaysLocal(14),
      });
      await promotions.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create promotion.");
    } finally {
      setBusy(false);
    }
  }

  async function promotionAction(promotion: SellerPromotion, action: "pause" | "resume" | "cancel") {
    setBusy(true);
    clearMessages();
    try {
      await apiRequest(`/seller/promotions/${promotion.id}`, { method: "PATCH", body: { action } });
      setFlash(`Promotion ${action === "cancel" ? "cancelled" : action + "d"}.`);
      await promotions.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update promotion.");
    } finally {
      setBusy(false);
    }
  }

  async function saveReply(event: FormEvent, saleId: number) {
    event.preventDefault();
    setBusy(true);
    clearMessages();
    try {
      await apiRequest(`/seller/reviews/${saleId}/reply`, { method: "POST", body: { message: replyText } });
      setFlash("Reply published.");
      setReplyFor(null);
      setReplyText("");
      await reviews.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish reply.");
    } finally {
      setBusy(false);
    }
  }

  async function reportReview(event: FormEvent, saleId: number) {
    event.preventDefault();
    setBusy(true);
    clearMessages();
    try {
      await apiRequest(`/seller/reviews/${saleId}/report`, { method: "POST", body: { reason: reportReason } });
      setFlash("Review reported for moderation.");
      setReportFor(null);
      setReportReason("");
      await reviews.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not report review.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadCsv(type: "sales" | "inventory" | "finance") {
    setError("");
    try {
      const response = await fetch(`${env.apiBase}/seller/analytics/export?type=${type}&range_days=${range}`, {
        headers: { Authorization: `Bearer ${getStoredToken()}` },
        credentials: "include",
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `seller-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download the export.");
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Growth"
        title="RFQs, promotions & insights"
        description="Win bulk buyers with quotations, run approved promotions and understand where sales come from."
        actions={
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void reloadAll()}>
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
          { id: "rfqs", label: "RFQs", count: rfqs.data?.items.length },
          { id: "quotations", label: "My quotations", count: quotations.data?.items.length },
          { id: "promotions", label: "Promotions", count: promotions.data?.items.length },
          { id: "reviews", label: "Reviews", count: reviews.data?.summary.total_reviews },
          { id: "analytics", label: "Analytics" },
        ]}
      />

      {tab === "rfqs" ? (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionCard title="Open RFQs" description="Buyer requests currently accepting quotations.">
            {rfqs.loading ? (
              <SellerLoading label="Loading RFQs..." />
            ) : rfqs.error ? (
              <SellerError message={rfqs.error} onRetry={rfqs.reload} />
            ) : rfqs.data && rfqs.data.items.length === 0 ? (
              <EmptyState title="No open RFQs" description="New buyer requests will appear here." icon={<MessagesSquare size={22} />} />
            ) : (
              <div className="space-y-2">
                {rfqs.data?.items.map((rfq) => (
                  <button
                    key={rfq.id}
                    type="button"
                    onClick={() => openQuote(rfq)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                      selectedRfq?.id === rfq.id ? "border-brand bg-brand/5" : "border-border bg-surface hover:border-brand/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text">{rfq.product_interest}</p>
                        <p className="text-xs text-text-muted">
                          {rfq.company_name} · {rfq.quantity} units · {rfq.category || "general"}
                        </p>
                        <p className="mt-1 text-xs text-text-muted">
                          Deadline: {rfq.deadline ? formatDate(rfq.deadline) : "open"} · {rfq.quotation_count} quote(s)
                        </p>
                      </div>
                      {rfq.my_quotation ? (
                        <span className={`badge border ${sellerStatusTone(rfq.my_quotation.status)}`}>{rfq.my_quotation.status}</span>
                      ) : (
                        <span className="badge border border-border text-text-muted">not quoted</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title={selectedRfq ? `Quote RFQ #${selectedRfq.id}` : "RFQ detail"}
            description={selectedRfq ? `${selectedRfq.company_name} · ${selectedRfq.quantity} units` : "Select an RFQ to quote or ask a question."}
            action={selectedRfq ? <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setSelectedRfq(null)}>Close</Button> : undefined}
          >
            {!selectedRfq ? (
              <p className="text-sm text-text-muted">Quotations are private to you. The buyer only sees your company, price, lead time and notes.</p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-surface-soft/50 p-3 text-sm">
                  <p className="text-text-muted">Contact: {selectedRfq.contact_name}</p>
                  <p className="text-text-muted">Budget: {selectedRfq.target_budget || "not disclosed"}</p>
                  <p className="mt-1">{selectedRfq.notes || "No additional notes."}</p>
                </div>
                <form className="space-y-3" onSubmit={(event) => void submitQuote(event)}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Unit price"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={quote.unit_price}
                      onChange={(event) => setQuote({ ...quote, unit_price: event.target.value })}
                    />
                    <Input
                      label="Lead time (days)"
                      type="number"
                      min="0"
                      value={quote.lead_time_days}
                      onChange={(event) => setQuote({ ...quote, lead_time_days: event.target.value })}
                    />
                    <Input
                      label="Valid until"
                      type="datetime-local"
                      required
                      value={quote.valid_until}
                      onChange={(event) => setQuote({ ...quote, valid_until: event.target.value })}
                    />
                  </div>
                  <Textarea
                    label="Notes"
                    rows={3}
                    value={quote.notes}
                    onChange={(event) => setQuote({ ...quote, notes: event.target.value })}
                    hint="Delivery terms, warranty, minimum order or payment expectations."
                  />
                  <p className="text-sm text-text-muted">
                    Total for {selectedRfq.quantity} units:{" "}
                    <span className="font-bold text-text">{formatMoney(Number(quote.unit_price || 0) * selectedRfq.quantity)}</span>
                  </p>
                  <Button type="submit" loading={busy} disabled={!quote.unit_price}>
                    {selectedRfq.my_quotation ? "Revise quotation" : "Submit quotation"}
                  </Button>
                </form>
                <form className="space-y-2 border-t border-border pt-3" onSubmit={(event) => void askQuestion(event)}>
                  <Textarea
                    label="Ask the buyer a question"
                    rows={2}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    hint="At least 5 characters."
                  />
                  <Button type="submit" size="sm" variant="secondary" loading={busy} disabled={question.trim().length < 5}>
                    Send question
                  </Button>
                </form>
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {tab === "quotations" ? (
        <SectionCard title="My quotations" description="Prices never leak to other sellers; accepted quotations are locked.">
          {quotations.loading ? (
            <SellerLoading label="Loading quotations..." />
          ) : quotations.error ? (
            <SellerError message={quotations.error} onRetry={quotations.reload} />
          ) : quotations.data && quotations.data.items.length === 0 ? (
            <EmptyState title="No quotations yet" description="Quote an RFQ to start tracking responses." icon={<MessagesSquare size={22} />} />
          ) : (
            <div className="space-y-2">
              {quotations.data?.items.map((quotation) => (
                <div key={quotation.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{quotation.rfq?.product_interest || `RFQ #${quotation.rfq_id}`}</p>
                      <p className="text-xs text-text-muted">
                        {quotation.rfq?.company_name || "Buyer"} · {formatMoney(quotation.unit_price)}/unit · lead {quotation.lead_time_days ?? "—"} days
                      </p>
                      <p className="text-xs text-text-muted">
                        Total {formatMoney(quotation.total_price)} · v{quotation.version} · valid {quotation.valid_until ? formatDate(quotation.valid_until) : "open"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge border ${sellerStatusTone(quotation.status)}`}>{quotation.status}</span>
                      {["submitted", "revised"].includes(quotation.status) ? (
                        <Button size="sm" variant="danger" loading={busy} onClick={() => void withdraw(quotation)}>
                          Withdraw
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {quotation.notes ? <p className="mt-2 text-sm text-text-muted">{quotation.notes}</p> : null}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ) : null}

      {tab === "promotions" ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <SectionCard title="Create promotion" description="Only approved, active products can be promoted. Maximum 90 days and 90% off.">
            <form className="space-y-3" onSubmit={(event) => void createPromotion(event)}>
              <Select
                label="Product"
                required
                value={promo.product_id}
                onChange={(event) => setPromo({ ...promo, product_id: event.target.value })}
              >
                <option value="">Choose product</option>
                {products.data?.items.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} · {formatMoney(product.price)}</option>
                ))}
              </Select>
              <Input label="Promotion name" required value={promo.name} onChange={(event) => setPromo({ ...promo, name: event.target.value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Discount type" value={promo.discount_type} onChange={(event) => setPromo({ ...promo, discount_type: event.target.value })}>
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed amount</option>
                </Select>
                <Input
                  label={promo.discount_type === "percent" ? "Percent off" : "Amount off"}
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={promo.discount_value}
                  onChange={(event) => setPromo({ ...promo, discount_value: event.target.value })}
                />
                <Input label="Starts" type="datetime-local" required value={promo.starts_at} onChange={(event) => setPromo({ ...promo, starts_at: event.target.value })} />
                <Input label="Ends" type="datetime-local" required value={promo.ends_at} onChange={(event) => setPromo({ ...promo, ends_at: event.target.value })} />
              </div>
              <Button type="submit" loading={busy} icon={<Megaphone size={14} />} disabled={!promo.product_id || !promo.name}>
                Create promotion
              </Button>
            </form>
          </SectionCard>

          <SectionCard title="Promotions" description="Paused and scheduled promotions can be resumed or cancelled.">
            {promotions.loading ? (
              <SellerLoading label="Loading promotions..." />
            ) : promotions.error ? (
              <SellerError message={promotions.error} onRetry={promotions.reload} />
            ) : promotions.data && promotions.data.items.length === 0 ? (
              <EmptyState title="No promotions" description="Run a time-limited discount to attract buyers." icon={<Megaphone size={22} />} />
            ) : (
              <div className="space-y-2">
                {promotions.data?.items.map((promotion) => (
                  <div key={promotion.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{promotion.name}</p>
                        <p className="text-xs text-text-muted">
                          {promotion.product_name || `Product #${promotion.product_id}`} · {promotion.discount_type === "percent" ? `${promotion.discount_value}%` : formatMoney(promotion.discount_value)} off
                        </p>
                        <p className="text-xs text-text-muted">{formatDate(promotion.starts_at)} → {formatDate(promotion.ends_at)}</p>
                        {promotion.rejection_reason ? <p className="text-xs text-danger">{promotion.rejection_reason}</p> : null}
                      </div>
                      <span className={`badge border ${sellerStatusTone(promotion.status)}`}>{promotion.status}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {promotion.status === "active" ? (
                        <Button size="sm" variant="secondary" loading={busy} onClick={() => void promotionAction(promotion, "pause")}>Pause</Button>
                      ) : null}
                      {promotion.status === "paused" ? (
                        <Button size="sm" variant="secondary" loading={busy} onClick={() => void promotionAction(promotion, "resume")}>Resume</Button>
                      ) : null}
                      {["active", "scheduled", "paused"].includes(promotion.status) ? (
                        <Button size="sm" variant="ghost" loading={busy} onClick={() => void promotionAction(promotion, "cancel")}>Cancel</Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {tab === "reviews" ? (
        <div className="space-y-4">
          {reviews.loading ? (
            <SellerLoading label="Loading reviews..." />
          ) : reviews.error ? (
            <SellerError message={reviews.error} onRetry={reviews.reload} />
          ) : reviews.data ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="glass-card p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Average rating</p>
                  <p className="mt-1 flex items-center gap-1 font-display text-xl font-bold">
                    {reviews.data.summary.average_rating ?? "—"} <Star size={16} className="text-amber-500" />
                  </p>
                </div>
                <div className="glass-card p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Total reviews</p>
                  <p className="mt-1 font-display text-xl font-bold">{reviews.data.summary.total_reviews}</p>
                </div>
                <div className="glass-card p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">5-star</p>
                  <p className="mt-1 font-display text-xl font-bold">{reviews.data.summary.distribution["5"] || 0}</p>
                </div>
              </div>
              {reviews.data.items.length === 0 ? (
                <EmptyState title="No reviews yet" description="Reviews from completed orders appear here." icon={<Star size={22} />} />
              ) : (
                <div className="space-y-3">
                  {reviews.data.items.map((review: SellerReview) => (
                    <SectionCard
                      key={review.sale_id}
                      title={`${review.product || "Order product"} · ${review.rating}/5`}
                      description={`${formatDate(review.rated_at)} · order #${review.sale_id}`}
                    >
                      {review.reply ? (
                        <div className="mb-3 rounded-lg border border-border bg-surface-soft/40 p-3 text-sm">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Your reply</p>
                          <p>{review.reply.message}</p>
                        </div>
                      ) : null}
                      {review.reports.length > 0 ? (
                        <p className="mb-2 text-xs text-amber-600">
                          Reported: {review.reports.map((report) => report.status).join(", ")}
                        </p>
                      ) : null}
                      {replyFor === review.sale_id ? (
                        <form className="space-y-2" onSubmit={(event) => void saveReply(event, review.sale_id)}>
                          <Textarea label="Reply" rows={2} value={replyText} onChange={(event) => setReplyText(event.target.value)} />
                          <div className="flex gap-2">
                            <Button size="sm" type="submit" loading={busy}>Publish reply</Button>
                            <Button size="sm" type="button" variant="ghost" onClick={() => setReplyFor(null)}>Cancel</Button>
                          </div>
                        </form>
                      ) : reportFor === review.sale_id ? (
                        <form className="space-y-2" onSubmit={(event) => void reportReview(event, review.sale_id)}>
                          <Textarea
                            label="Why should moderators review this?"
                            rows={2}
                            value={reportReason}
                            onChange={(event) => setReportReason(event.target.value)}
                            hint="At least 10 characters."
                          />
                          <div className="flex gap-2">
                            <Button size="sm" type="submit" loading={busy} disabled={reportReason.trim().length < 10}>Report</Button>
                            <Button size="sm" type="button" variant="ghost" onClick={() => setReportFor(null)}>Cancel</Button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setReplyFor(review.sale_id);
                              setReplyText(review.reply?.message || "");
                              setReportFor(null);
                            }}
                          >
                            {review.reply ? "Edit reply" : "Reply"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={review.reports.some((report) => report.status === "open")}
                            onClick={() => {
                              setReportFor(review.sale_id);
                              setReportReason("");
                              setReplyFor(null);
                            }}
                          >
                            Report
                          </Button>
                        </div>
                      )}
                    </SectionCard>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "analytics" ? (
        <div className="space-y-4">
          <SectionCard
            title="Performance"
            description="Revenue only counts settled customer payments and excludes delivery fees."
            action={
              <div className="flex flex-wrap gap-2">
                <Select value={range} onChange={(event) => setRange(event.target.value)} aria-label="Analytics range">
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="365">Last year</option>
                </Select>
                <Button size="sm" variant="secondary" icon={<Download size={13} />} onClick={() => void downloadCsv("sales")}>Sales CSV</Button>
                <Button size="sm" variant="secondary" icon={<Download size={13} />} onClick={() => void downloadCsv("inventory")}>Stock CSV</Button>
                <Button size="sm" variant="secondary" icon={<Download size={13} />} onClick={() => void downloadCsv("finance")}>Finance CSV</Button>
              </div>
            }
          >
            {analytics.loading ? (
              <SellerLoading label="Loading analytics..." />
            ) : analytics.error ? (
              <SellerError message={analytics.error} onRetry={analytics.reload} />
            ) : analytics.data ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "Revenue", value: formatMoney(analytics.data.summary.revenue) },
                    { label: "Orders", value: analytics.data.summary.orders },
                    { label: "Paid orders", value: analytics.data.summary.paid_orders },
                    { label: "Avg order", value: formatMoney(analytics.data.summary.average_order_value) },
                    { label: "Fulfilment", value: `${analytics.data.summary.fulfilment_rate}%` },
                    { label: "Cancellation", value: `${analytics.data.summary.cancellation_rate}%` },
                    { label: "New customers", value: analytics.data.summary.new_customers },
                    { label: "Returning", value: analytics.data.summary.returning_customers },
                  ].map((metric) => (
                    <div key={metric.label} className="glass-card p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{metric.label}</p>
                      <p className="mt-1 font-display text-xl font-bold">{metric.value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-border p-3">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">Top products</p>
                    {analytics.data.top_products.length === 0 ? (
                      <p className="text-sm text-text-muted">No paid sales in this period.</p>
                    ) : analytics.data.top_products.map((row) => (
                      <div key={row.product} className="flex justify-between border-b border-border/60 py-1.5 text-sm last:border-0">
                        <span>{row.product} <span className="text-xs text-text-muted">({row.units} units)</span></span>
                        <span className="font-semibold">{formatMoney(row.revenue)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">Quotation activity</p>
                    <div className="space-y-1 text-sm">
                      <p className="flex justify-between"><span>Submitted/revised</span><span className="font-semibold">{analytics.data.quotation_activity.submitted}</span></p>
                      <p className="flex justify-between"><span>Accepted</span><span className="font-semibold">{analytics.data.quotation_activity.accepted}</span></p>
                      <p className="flex justify-between"><span>Withdrawn</span><span className="font-semibold">{analytics.data.quotation_activity.withdrawn}</span></p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-border p-3 text-xs text-text-muted">
                  <p className="mb-1 flex items-center gap-1 font-bold uppercase tracking-wide"><BarChart3 size={13} /> Notes</p>
                  {analytics.data.notes.map((note) => <p key={note}>{note}</p>)}
                </div>
              </div>
            ) : null}
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
