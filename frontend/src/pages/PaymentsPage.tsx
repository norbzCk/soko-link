import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { apiRequest } from "../lib/http";
import { EmptyState, InlineNotice, PageIntro, SectionCard, StatCards } from "../components/ui/PageSections";
import type { Order, PaymentHistoryItem, PaymentMethod, PaymentResponse } from "../types/domain";

function formatMoney(value?: number) {
  return `TZS ${Number(value || 0).toLocaleString()}`;
}

export function PaymentsPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<PaymentHistoryItem[]>([]);
  const [result, setResult] = useState<PaymentResponse | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const preselectedOrderId = params.get("order_id") || "";
  const preselectedAmount = params.get("amount") || "";

  useEffect(() => {
    if (user?.role === "user") {
      void load();
    }
  }, [user?.role]);

  async function load() {
    try {
      const [methodsData, orderData, historyData] = await Promise.all([
        apiRequest<{ payment_methods: PaymentMethod[] }>("/payments/methods"),
        apiRequest<Order[]>("/orders/"),
        apiRequest<{ payments: PaymentHistoryItem[] }>("/payments/history"),
      ]);
      setMethods(methodsData.payment_methods || []);
      setOrders(orderData);
      setHistory(historyData.payments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFlash("");

    const form = new FormData(event.currentTarget);
    const orderId = Number(form.get("order_id"));
    const amount = Number(form.get("amount"));
    const method = String(form.get("payment_method") || "");
    const phone = String(form.get("phone_number") || "").trim();

    try {
      const response = ["mpesa", "airtel_money", "tigopesa"].includes(method)
        ? await apiRequest<PaymentResponse>(`/payments/mobile-money/stk-push?phone_number=${encodeURIComponent(phone)}&amount=${amount}&order_id=${orderId}&provider=${encodeURIComponent(method)}`, { method: "POST" })
        : await apiRequest<PaymentResponse>("/payments/initiate", {
            method: "POST",
            body: { order_id: orderId, amount, payment_method: method, phone_number: phone || null },
          });
      setResult(response);
      setFlash("Payment initiated.");
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate payment");
    }
  }

  async function handleClearHistory() {
    if (!confirm("Are you sure you want to clear all payment history? This action cannot be undone.")) {
      return;
    }
    try {
      await apiRequest("/payments/history", { method: "DELETE" });
      setHistory([]);
      setFlash("Payment history cleared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear payment history");
    }
  }

  if (user?.role !== "user") {
    return (
      <section className="rounded-[2rem] border border-white/60 bg-white/80 p-8 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur dark:border-white/10 dark:bg-slate-900/70">
        <h1 className="font-display text-2xl font-black tracking-tight text-slate-950 dark:text-white">Payments</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Payments are only available in the customer flow.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6 animate-soft-enter">
      <PageIntro
        eyebrow="Payments"
        title="Pay for orders and review transaction history"
        description="This buyer payment workspace now matches the rest of the product with cleaner hierarchy, safer form grouping, and a readable transaction ledger."
      />

      <StatCards
        items={[
          { id: "methods", label: "Payment methods", value: methods.length, note: methods.length ? "Available at checkout" : "No methods loaded yet" },
          { id: "orders", label: "Payable orders", value: orders.length, note: "Orders available for payment initiation" },
          { id: "history", label: "Payment records", value: history.length, note: history.length ? "Transactions already captured" : "No payment history yet" },
        ]}
      />

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {flash ? <InlineNotice tone="success">{flash}</InlineNotice> : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.3fr]">
        <SectionCard
          title="Initiate payment"
          description="Choose an order, confirm the amount, and submit through your preferred payment channel."
        >
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <label className="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Order
              <select
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-brand/30 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                name="order_id"
                defaultValue={preselectedOrderId}
                required
              >
                <option value="">Select order</option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id}>
                    #{order.id} {order.product} - {formatMoney(order.total || Number(order.unit_price || 0) * Number(order.quantity || 0))}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Amount
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-brand/30 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={preselectedAmount}
                required
              />
            </label>

            <label className="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Method
              <select
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-brand/30 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                name="payment_method"
                required
              >
                <option value="">Select method</option>
                {methods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
              </select>
            </label>

            <label className="space-y-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Phone number
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-brand/30 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                name="phone_number"
                placeholder="Optional for card or bank flows"
              />
            </label>

            <div className="md:col-span-2 flex flex-wrap gap-3">
              <button className="btn-primary" type="submit">Pay now</button>
            </div>
          </form>

          {result ? (
            <div className="mt-6 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              <p className="text-[11px] font-black uppercase tracking-[0.2em]">Latest transaction</p>
              <strong className="mt-2 block font-display text-2xl font-black tracking-tight">{result.transaction_id}</strong>
              <p className="mt-2 text-sm">{result.message}</p>
              <p className="mt-3 text-sm font-semibold">{formatMoney(result.amount)}</p>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Payment history"
          description="Transactions are shown in a mobile-friendly card grid so nothing becomes unreadable on smaller screens."
          action={
            <button className="btn-secondary" onClick={handleClearHistory} type="button" disabled={!history.length}>
              Clear history
            </button>
          }
        >
          {!history.length ? (
            <EmptyState
              title="No payment history yet"
              description="Once you initiate transactions, each record will appear here with status, order linkage, and payment method."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {history.map((item) => (
                <article
                  key={item.transaction_id}
                  className="rounded-[1.5rem] border border-slate-200/80 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                       <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-300">Transaction</p>
                      <h3 className="mt-2 font-display text-lg font-black tracking-tight text-slate-950 dark:text-white">{item.transaction_id}</h3>
                    </div>
                    <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                      {item.status}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <DataCell label="Order" value={`#${item.order_id}`} />
                    <DataCell label="Method" value={item.payment_method || "-"} />
                    <DataCell label="Amount" value={formatMoney(item.amount)} />
                    <DataCell label="Date" value={item.date || "-"} />
                  </div>

                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{item.product || "No product name available"}</p>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function DataCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-slate-800">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
