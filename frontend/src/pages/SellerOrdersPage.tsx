import { useState } from "react";
import type { FormEvent } from "react";
import { ClipboardList, RefreshCw, Truck, X } from "lucide-react";
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
import { formatDate, formatDateTime, formatMoney } from "../lib/format";
import type { SellerOrder } from "../types/seller";

const transitions: Record<string, string[]> = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Packed", "Cancelled"],
  Packed: ["Ready For Shipping", "Cancelled"],
  "Ready For Shipping": ["Shipped", "Cancelled"],
  "Delivery Failed": ["Ready For Shipping", "Cancelled"],
};

interface LogisticsOption {
  id: number;
  name: string;
  vehicle_type?: string | null;
  base_area?: string | null;
  status?: string | null;
  availability?: string | null;
}

interface DeliveryRow {
  id: number;
  order_id?: number | null;
  status: string;
  logistics_name?: string | null;
  logistics_phone?: string | null;
  pickup_location?: string | null;
  delivery_location?: string | null;
  price: number;
  special_instructions?: string | null;
  created_at?: string | null;
  delivered_at?: string | null;
  failure_reason?: string | null;
}

type Tab = "orders" | "deliveries";

export function SellerOrdersPage() {
  const [tab, setTab] = useState<Tab>("orders");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<SellerOrder | null>(null);
  const [logistics, setLogistics] = useState<LogisticsOption[]>([]);
  const [logisticsId, setLogisticsId] = useState("");
  const [reason, setReason] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [deliveryForm, setDeliveryForm] = useState<Record<number, string>>({});

  const orders = useSellerResource<{ items: SellerOrder[]; total: number }>(
    `/seller/orders?limit=100${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ""}`,
  );
  const deliveries = useSellerResource<{ items: DeliveryRow[] }>("/seller/deliveries");

  async function openOrder(order: SellerOrder) {
    setSelected(order.id);
    setDetail(order);
    setError("");
    setNextStatus("");
    setReason("");
    try {
      const response = await apiRequest<{ order: SellerOrder }>(`/seller/orders/${order.id}`);
      setDetail(response.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load order detail.");
    }
    if (logistics.length === 0) {
      try {
        const response = await apiRequest<{ items: LogisticsOption[] }>("/business/logistics-options");
        setLogistics(response.items);
      } catch {
        // Delivery assignment remains optional if no partners are online.
      }
    }
  }

  async function decide(decision: "accept" | "reject") {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/seller/orders/${detail.id}/decision`, {
        method: "PATCH",
        body: { decision, reason: reason || undefined },
      });
      setFlash(`Order #${detail.id} ${decision === "accept" ? "accepted" : "rejected"}.`);
      await orders.reload();
      await openOrder(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the order.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(event: FormEvent) {
    event.preventDefault();
    if (!detail || !nextStatus) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/seller/orders/${detail.id}/status`, {
        method: "PATCH",
        body: { status: nextStatus, reason: reason || undefined },
      });
      setFlash(`Order #${detail.id} moved to ${nextStatus}.`);
      setNextStatus("");
      await orders.reload();
      await openOrder(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change order status.");
    } finally {
      setBusy(false);
    }
  }

  async function assignDelivery(event: FormEvent) {
    event.preventDefault();
    if (!detail || !logisticsId) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/seller/orders/${detail.id}/assign-delivery`, {
        method: "POST",
        body: { logistics_id: Number(logisticsId) },
      });
      setFlash("Delivery partner assigned.");
      setLogisticsId("");
      await orders.reload();
      await deliveries.reload();
      await openOrder(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign delivery.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDelivery(delivery: DeliveryRow) {
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/seller/deliveries/${delivery.id}/instructions`, {
        method: "PATCH",
        body: { special_instructions: deliveryForm[delivery.id] ?? delivery.special_instructions },
      });
      setFlash("Delivery instructions updated.");
      await deliveries.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update delivery.");
    } finally {
      setBusy(false);
    }
  }

  const availableTransitions = detail ? transitions[String(detail.status || "").trim()] || [] : [];

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Fulfilment"
        title="Orders & deliveries"
        description="Accept or reject orders, move them through the platform state machine and hand them to verified logistics partners."
        actions={
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void Promise.all([orders.reload(), deliveries.reload()])}>
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
          { id: "orders", label: "Orders", count: orders.data?.total },
          { id: "deliveries", label: "Deliveries", count: deliveries.data?.items.length },
        ]}
      />

      {tab === "orders" ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <SectionCard
            title="Orders"
            description="Only orders belonging to your seller account are returned."
            action={
              <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter orders">
                <option value="">All statuses</option>
                {["Pending", "Confirmed", "Packed", "Ready For Shipping", "Shipped", "Received", "Cancelled"].map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </Select>
            }
          >
            {orders.loading ? (
              <SellerLoading label="Loading orders..." />
            ) : orders.error ? (
              <SellerError message={orders.error} onRetry={orders.reload} />
            ) : orders.data && orders.data.items.length === 0 ? (
              <EmptyState title="No orders" description="New customer orders will appear here." icon={<ClipboardList size={22} />} />
            ) : (
              <div className="space-y-2">
                {orders.data?.items.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => void openOrder(order)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                      selected === order.id ? "border-brand bg-brand/5" : "border-border bg-surface hover:border-brand/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text">#{order.id} · {order.product || "Order"}</p>
                        <p className="text-xs text-text-muted">
                          {order.customer_name || "Customer"} · {order.quantity} unit(s) · {formatDate(order.order_date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatMoney(order.total)}</p>
                        <span className={`badge border ${sellerStatusTone(order.status)}`}>{order.status}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title={detail ? `Order #${detail.id}` : "Order detail"}
            description={detail ? `${detail.customer_name || "Customer"} · ${detail.payment_status || "payment not started"}` : "Select an order to manage it."}
            action={detail ? <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => { setDetail(null); setSelected(null); }}>Close</Button> : undefined}
          >
            {!detail ? (
              <p className="text-sm text-text-muted">Choose an order from the list to see items, status history and fulfilment actions.</p>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="grid gap-2 rounded-xl border border-border bg-surface-soft/50 p-3">
                  <p><span className="text-text-muted">Delivery:</span> {detail.delivery_address || "Not provided"}</p>
                  <p><span className="text-text-muted">Phone:</span> {detail.delivery_phone || detail.customer_phone || "Not provided"}</p>
                  <p><span className="text-text-muted">Method:</span> {detail.delivery_method || "Standard"}</p>
                  <p><span className="text-text-muted">Payment:</span> {detail.payment_status || "not_started"} ({detail.payment_method || "—"})</p>
                  <p><span className="text-text-muted">Delivery partner:</span> {detail.logistics_name || "Not assigned"}</p>
                </div>

                {detail.items && detail.items.length > 0 ? (
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Items</p>
                    {detail.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between border-b border-border/60 py-1.5">
                        <span>{item.product_name} × {item.quantity}</span>
                        <span>{formatMoney(item.total_amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {detail.status === "Pending" ? (
                  <div className="space-y-2 rounded-xl border border-border p-3">
                    <Textarea
                      label="Reason (optional)"
                      rows={2}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" loading={busy} onClick={() => void decide("accept")}>Accept order</Button>
                      <Button size="sm" variant="danger" loading={busy} onClick={() => void decide("reject")}>Reject</Button>
                    </div>
                  </div>
                ) : null}

                {availableTransitions.length > 0 ? (
                  <form className="space-y-2 rounded-xl border border-border p-3" onSubmit={(event) => void changeStatus(event)}>
                    <Select label="Next status" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)} required>
                      <option value="">Choose status</option>
                      {availableTransitions.map((status) => <option key={status} value={status}>{status}</option>)}
                    </Select>
                    <Input label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
                    <Button size="sm" type="submit" loading={busy} disabled={!nextStatus}>Update status</Button>
                  </form>
                ) : null}

                {!detail.delivery_id && !["Cancelled", "Received"].includes(detail.status) ? (
                  <form className="space-y-2 rounded-xl border border-border p-3" onSubmit={(event) => void assignDelivery(event)}>
                    <Select label="Assign logistics partner" value={logisticsId} onChange={(event) => setLogisticsId(event.target.value)} required>
                      <option value="">Choose partner</option>
                      {logistics
                        .filter((item) => item.status === "online" && item.availability === "available")
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {item.vehicle_type || "vehicle"} · {item.base_area || "area"}
                          </option>
                        ))}
                    </Select>
                    <Button size="sm" type="submit" loading={busy} disabled={!logisticsId} icon={<Truck size={14} />}>
                      Assign delivery
                    </Button>
                    <p className="text-xs text-text-muted">Delivery can only be assigned after the customer payment is settled.</p>
                  </form>
                ) : null}

                {detail.status_history && detail.status_history.length > 0 ? (
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Status history</p>
                    {detail.status_history.map((entry, index) => (
                      <div key={`${entry.status}-${index}`} className="border-b border-border/60 py-1.5 text-xs">
                        <span className="font-semibold">{entry.status}</span>
                        <span className="text-text-muted"> · {formatDateTime(entry.created_at)} · {entry.actor_type}</span>
                        {entry.reason ? <p className="text-text-muted">{entry.reason}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {tab === "deliveries" ? (
        <SectionCard title="Deliveries" description="Read-only tracking plus delivery instructions you own.">
          {deliveries.loading ? (
            <SellerLoading label="Loading deliveries..." />
          ) : deliveries.error ? (
            <SellerError message={deliveries.error} onRetry={deliveries.reload} />
          ) : deliveries.data && deliveries.data.items.length === 0 ? (
            <EmptyState title="No deliveries" description="Assigned deliveries will appear here." icon={<Truck size={22} />} />
          ) : (
            <div className="space-y-3">
              {deliveries.data?.items.map((delivery) => (
                <div key={delivery.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-text">Delivery #{delivery.id} · Order #{delivery.order_id}</p>
                      <p className="text-xs text-text-muted">
                        {delivery.logistics_name || "Unassigned"} · {delivery.pickup_location || "pickup"} → {delivery.delivery_location || "destination"}
                      </p>
                      {delivery.failure_reason ? <p className="text-xs text-danger">{delivery.failure_reason}</p> : null}
                    </div>
                    <span className={`badge border ${sellerStatusTone(delivery.status)}`}>{delivery.status.replace(/_/g, " ")}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <Input
                      label="Special instructions"
                      value={deliveryForm[delivery.id] ?? delivery.special_instructions ?? ""}
                      onChange={(event) => setDeliveryForm({ ...deliveryForm, [delivery.id]: event.target.value })}
                      disabled={["delivered", "cancelled"].includes(delivery.status)}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy}
                      disabled={["delivered", "cancelled"].includes(delivery.status)}
                      onClick={() => void updateDelivery(delivery)}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
