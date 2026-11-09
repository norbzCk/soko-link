import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  ClipboardList,
  MessageSquare,
  Package,
  Star,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { PageIntro, SectionCard, StatCards, EmptyState } from "../components/ui/PageSections";
import { StatusBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { SellerError, SellerLoading, useSellerResource } from "../features/seller/SellerUI";
import { formatDate, formatMoney } from "../lib/format";
import type { SellerDashboard } from "../types/seller";

export function SellerDashboardPage() {
  const { data, loading, error, reload } = useSellerResource<SellerDashboard>("/seller/dashboard");

  if (loading) return <SellerLoading label="Loading seller dashboard..." />;
  if (error) return <SellerError message={error} onRetry={reload} />;
  if (!data) return null;

  const { summary, finance, inventory, business } = data;

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Seller workspace"
        title={business.business_name}
        description="Manage products, fulfilment, quotations, inventory and payouts from one verified workspace."
        badges={
          <>
            <span className="badge badge-success">{business.verification_status || "unverified"}</span>
            <span className="badge badge-neutral">{business.category || "No category set"}</span>
            <span className="badge badge-neutral">{business.region || "Location not set"}</span>
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => void reload()}>
              Refresh
            </Button>
            <Link to="/app/seller/catalog">
              <Button icon={<Package size={15} />}>Manage catalogue</Button>
            </Link>
          </>
        }
      />

      {data.actions.length > 0 ? (
        <SectionCard title="Needs your attention" description="Actions generated from live order, stock and moderation data.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.actions.map((action) => (
              <Link
                key={action.id}
                to={action.href}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-soft/60 px-4 py-3 text-sm font-semibold text-text transition-colors hover:border-brand/40 hover:text-brand"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-500" />
                  {action.label}
                </span>
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <StatCards
        items={[
          {
            id: "revenue",
            label: "Settled revenue (all time)",
            value: formatMoney(summary.revenue_total),
            note: `Available ${formatMoney(finance.available_for_payout)}`,
            icon: <TrendingUp size={18} />,
          },
          {
            id: "orders",
            label: "Orders needing action",
            value: summary.orders_pending,
            note: `${summary.orders_total} lifetime orders`,
            icon: <ClipboardList size={18} />,
          },
          {
            id: "quotes",
            label: "Active quotations",
            value: summary.my_active_quotations,
            note: `${summary.pending_rfqs} open RFQs on the marketplace`,
            icon: <MessageSquare size={18} />,
          },
          {
            id: "rating",
            label: "Customer rating",
            value: summary.average_rating ? `${summary.average_rating.toFixed(1)} / 5` : "No reviews",
            note: `${summary.rating_count} verified reviews`,
            icon: <Star size={18} />,
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard
          title="Financial position"
          description="Only settled payments count as revenue. Pending settlements and refunds are shown separately."
          className="xl:col-span-2"
          action={
            <Link to="/app/seller/finance">
              <Button size="sm" variant="secondary">Open finance</Button>
            </Link>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Gross revenue", value: finance.gross_revenue, icon: <BadgeDollarSign size={16} /> },
              { label: `Platform fee (${finance.platform_fee_percent}%)`, value: finance.platform_fee },
              { label: "Net revenue", value: finance.net_revenue },
              { label: "Available for payout", value: finance.available_for_payout, icon: <Wallet size={16} /> },
              { label: "Pending settlement", value: finance.pending_settlement },
              { label: "Pending refunds", value: finance.refunds_pending },
              { label: "Pending payouts", value: finance.pending_payouts },
              { label: "Paid out", value: finance.paid_out },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{item.label}</p>
                <p className="mt-1 flex items-center gap-2 font-display text-lg font-bold text-text">
                  {item.icon}
                  {formatMoney(item.value)}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Store health" description="Live catalogue and stock signals.">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Products listed</span>
              <strong>{inventory.total_products}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Inventory value</span>
              <strong>{formatMoney(inventory.total_value)}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Low stock</span>
              <strong className={inventory.low_stock ? "text-amber-600" : ""}>{inventory.low_stock}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Out of stock</span>
              <strong className={inventory.out_of_stock ? "text-danger" : ""}>{inventory.out_of_stock}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Awaiting review</span>
              <strong>{summary.pending_products}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Open disputes</span>
              <strong>{summary.open_disputes}</strong>
            </div>
            {inventory.alerts.length > 0 ? (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                {inventory.alerts.slice(0, 4).map((alert) => (
                  <div key={alert.product_id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{alert.product_name}</span>
                    <span className="font-bold text-amber-600">{alert.current_stock} left</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Recent orders"
        description="Orders are always filtered to this seller account."
        action={
          <Link to="/app/seller/orders">
            <Button size="sm" variant="secondary">All orders</Button>
          </Link>
        }
      >
        {data.recent_orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="Orders appear here as soon as customers buy your approved products."
            icon={<Store size={22} />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-muted">
                  <th className="px-2 py-2">Order</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Customer</th>
                  <th className="px-2 py-2">Total</th>
                  <th className="px-2 py-2">Payment</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_orders.map((order) => (
                  <tr key={order.id} className="border-b border-border/60 last:border-0">
                    <td className="px-2 py-3 font-semibold">#{order.id}</td>
                    <td className="px-2 py-3">{order.product || "—"}</td>
                    <td className="px-2 py-3">{order.customer_name || "Customer"}</td>
                    <td className="px-2 py-3">{formatMoney(order.total)}</td>
                    <td className="px-2 py-3"><StatusBadge status={order.payment_status || "not_started"} /></td>
                    <td className="px-2 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-2 py-3 text-text-muted">{formatDate(order.order_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { to: "/app/seller/orders", title: "Fulfilment", body: "Accept, pack, dispatch and hand over orders.", icon: <CheckCircle2 size={18} /> },
          { to: "/app/seller/growth", title: "Growth", body: "Answer RFQs, publish offers and review performance.", icon: <TrendingUp size={18} /> },
          { to: "/app/seller/finance", title: "Payouts", body: "Verify your payout account and withdraw earnings.", icon: <Wallet size={18} /> },
        ].map((item) => (
          <Link key={item.to} to={item.to} className="glass-card flex items-start gap-3 p-5 transition-colors hover:border-brand/40">
            <span className="rounded-xl bg-brand/10 p-2 text-brand">{item.icon}</span>
            <span>
              <span className="block font-display font-semibold text-text">{item.title}</span>
              <span className="mt-1 block text-xs text-text-muted">{item.body}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
