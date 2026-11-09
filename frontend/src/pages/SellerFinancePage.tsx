import { useState } from "react";
import type { FormEvent } from "react";
import { Banknote, Landmark, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { PageIntro, SectionCard, EmptyState } from "../components/ui/PageSections";
import { Button } from "../components/ui/Button";
import { Input, Select } from "../components/ui/Field";
import {
  SellerError,
  SellerLoading,
  SellerNotice,
  SellerTabs,
  sellerStatusTone,
  useSellerResource,
} from "../features/seller/SellerUI";
import { apiRequest } from "../lib/http";
import { formatDate, formatMoney } from "../lib/format";
import type { SellerFinance } from "../types/seller";

interface FinanceTransaction {
  transaction_id: string;
  sale_id: number;
  product?: string | null;
  amount: number;
  status: string;
  payment_method?: string | null;
  created_at?: string | null;
  confirmed_at?: string | null;
}

interface PayoutRow {
  id: number;
  amount: number;
  currency: string;
  status: string;
  method?: string | null;
  destination_label?: string | null;
  reference?: string | null;
  note?: string | null;
  rejection_reason?: string | null;
  requested_at?: string | null;
  processed_at?: string | null;
}

type Tab = "overview" | "transactions" | "payouts" | "account";

export function SellerFinancePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [accountForm, setAccountForm] = useState({
    method: "bank_transfer",
    account_name: "",
    account_number: "",
    bank_name: "",
    network: "",
  });
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");

  const finance = useSellerResource<SellerFinance>("/seller/finance/overview");
  const transactions = useSellerResource<{ items: FinanceTransaction[]; total: number }>("/seller/finance/transactions?limit=100");
  const payouts = useSellerResource<{ items: PayoutRow[] }>("/seller/payouts");

  async function requestPayout(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFlash("");
    try {
      await apiRequest("/seller/payouts", {
        method: "POST",
        body: {
          amount: Number(payoutAmount),
          note: payoutNote,
          idempotency_key: `payout-${Date.now()}`,
        },
      });
      setFlash("Payout request submitted for review.");
      setPayoutAmount("");
      setPayoutNote("");
      await Promise.all([finance.reload(), payouts.reload()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request payout.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAccount(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setFlash("");
    try {
      await apiRequest("/seller/payout-account", {
        method: "PUT",
        body: {
          method: accountForm.method,
          account_name: accountForm.account_name,
          account_number: accountForm.account_number,
          bank_name: accountForm.method === "bank_transfer" ? accountForm.bank_name : undefined,
          network: accountForm.method === "mobile_money" ? accountForm.network : undefined,
        },
      });
      setFlash("Payout account saved and sent for verification.");
      setAccountForm({ ...accountForm, account_number: "" });
      await finance.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save payout account.");
    } finally {
      setBusy(false);
    }
  }

  const data = finance.data;
  const account = data?.payout_account;

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Finance"
        title="Revenue & payouts"
        description="Only settled customer payments count as revenue. Platform commission and pending refunds are shown before your withdrawable balance."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={14} />}
            onClick={() => void Promise.all([finance.reload(), transactions.reload(), payouts.reload()])}
          >
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
          { id: "overview", label: "Overview" },
          { id: "transactions", label: "Transactions", count: transactions.data?.total },
          { id: "payouts", label: "Payouts", count: payouts.data?.items.length },
          { id: "account", label: "Payout account" },
        ]}
      />

      {finance.loading ? (
        <SellerLoading label="Loading finance..." />
      ) : finance.error ? (
        <SellerError message={finance.error} onRetry={finance.reload} />
      ) : tab === "overview" && data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Gross revenue", value: formatMoney(data.gross_revenue), hint: "settled orders" },
              { label: "Platform fee", value: formatMoney(data.platform_fee), hint: `${data.platform_fee_percent}% commission` },
              { label: "Net revenue", value: formatMoney(data.net_revenue), hint: "after commission" },
              { label: "Available", value: formatMoney(data.available_for_payout), hint: "ready to withdraw" },
              { label: "Pending settlement", value: formatMoney(data.pending_settlement), hint: "awaiting payment confirmation" },
              { label: "Refunds pending", value: formatMoney(data.refunds_pending), hint: "paid cancelled orders" },
              { label: "Pending payouts", value: formatMoney(data.pending_payouts), hint: "requested / processing" },
              { label: "Paid out", value: formatMoney(data.paid_out), hint: "completed" },
            ].map((metric) => (
              <div key={metric.label} className="glass-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{metric.label}</p>
                <p className="mt-1 font-display text-xl font-bold">{metric.value}</p>
                <p className="text-[11px] text-text-muted">{metric.hint}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard
              title="Request payout"
              description={
                account?.status === "verified"
                  ? `Minimum ${formatMoney(data.minimum_payout_amount || 0)}. Available ${formatMoney(data.available_for_payout)}.`
                  : "A verified payout account is required before withdrawing."
              }
            >
              {account?.status === "verified" ? (
                <form className="space-y-3" onSubmit={(event) => void requestPayout(event)}>
                  <Input
                    label="Amount"
                    type="number"
                    min={data.minimum_payout_amount || 0}
                    max={data.available_for_payout}
                    step="0.01"
                    required
                    value={payoutAmount}
                    onChange={(event) => setPayoutAmount(event.target.value)}
                    hint={`Available: ${formatMoney(data.available_for_payout)}`}
                  />
                  <Input label="Note (optional)" value={payoutNote} onChange={(event) => setPayoutNote(event.target.value)} />
                  <Button type="submit" loading={busy} disabled={!data.can_request_payout} icon={<Wallet size={14} />}>
                    Request payout
                  </Button>
                </form>
              ) : (
                <div className="rounded-xl border border-border bg-surface-soft/40 p-4 text-sm">
                  <p className="font-semibold">
                    {account ? `Account ${account.status}` : "No payout account yet"}
                  </p>
                  {account?.rejection_reason ? <p className="text-xs text-danger">{account.rejection_reason}</p> : null}
                  <Button className="mt-3" size="sm" variant="secondary" onClick={() => setTab("account")}>
                    {account ? "Update payout account" : "Add payout account"}
                  </Button>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Recent payouts" description="Latest withdrawal requests and their status.">
              {data.recent_payouts && data.recent_payouts.length > 0 ? (
                <div className="space-y-2">
                  {data.recent_payouts.map((payout) => (
                    <div key={payout.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold">{formatMoney(payout.amount)}</p>
                        <p className="text-xs text-text-muted">{payout.reference || `Payout #${payout.id}`} · {formatDate(payout.requested_at)}</p>
                      </div>
                      <span className={`badge border ${sellerStatusTone(payout.status)}`}>{payout.status}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No payouts yet" description="Your withdrawal history will appear here." icon={<Banknote size={22} />} />
              )}
            </SectionCard>
          </div>
        </>
      ) : null}

      {tab === "transactions" ? (
        <SectionCard title="Payment transactions" description="Customer payments linked to your orders, including pending and failed attempts.">
          {transactions.loading ? (
            <SellerLoading label="Loading transactions..." />
          ) : transactions.error ? (
            <SellerError message={transactions.error} onRetry={transactions.reload} />
          ) : transactions.data && transactions.data.items.length === 0 ? (
            <EmptyState title="No transactions" description="Payments will appear here once customers check out." icon={<Landmark size={22} />} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-muted">
                    <th className="px-2 py-2">Reference</th>
                    <th className="px-2 py-2">Order</th>
                    <th className="px-2 py-2">Product</th>
                    <th className="px-2 py-2">Amount</th>
                    <th className="px-2 py-2">Method</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.data?.items.map((transaction) => (
                    <tr key={transaction.transaction_id} className="border-b border-border/60 last:border-0">
                      <td className="px-2 py-3 font-mono text-xs">{transaction.transaction_id}</td>
                      <td className="px-2 py-3">#{transaction.sale_id}</td>
                      <td className="px-2 py-3">{transaction.product || "—"}</td>
                      <td className="px-2 py-3 font-semibold">{formatMoney(transaction.amount)}</td>
                      <td className="px-2 py-3">{transaction.payment_method || "—"}</td>
                      <td className="px-2 py-3">
                        <span className={`badge border ${sellerStatusTone(transaction.status)}`}>{transaction.status}</span>
                      </td>
                      <td className="px-2 py-3 text-text-muted">{formatDate(transaction.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}

      {tab === "payouts" ? (
        <SectionCard title="Payout history" description="Requested, approved, processing, completed and rejected withdrawals.">
          {payouts.loading ? (
            <SellerLoading label="Loading payouts..." />
          ) : payouts.error ? (
            <SellerError message={payouts.error} onRetry={payouts.reload} />
          ) : payouts.data && payouts.data.items.length === 0 ? (
            <EmptyState title="No payouts" description="Request a payout when your balance is available." icon={<Wallet size={22} />} />
          ) : (
            <div className="space-y-2">
              {payouts.data?.items.map((payout) => (
                <div key={payout.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{formatMoney(payout.amount)} · {payout.reference || `Payout #${payout.id}`}</p>
                      <p className="text-xs text-text-muted">
                        {payout.destination_label || payout.method || "account"} · requested {formatDate(payout.requested_at)}
                      </p>
                      {payout.rejection_reason ? <p className="text-xs text-danger">{payout.rejection_reason}</p> : null}
                      {payout.note ? <p className="text-xs text-text-muted">{payout.note}</p> : null}
                    </div>
                    <span className={`badge border ${sellerStatusTone(payout.status)}`}>{payout.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ) : null}

      {tab === "account" ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <SectionCard title="Current account" description="Only masked account details are stored and displayed.">
            {account ? (
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  <ShieldCheck size={16} /> {account.account_name}
                </p>
                <p className="text-text-muted">{account.method.replace(/_/g, " ")} · {account.account_number_masked}</p>
                <p>
                  Status: <span className={`badge border ${sellerStatusTone(account.status)}`}>{account.status}</span>
                </p>
                {account.rejection_reason ? <p className="text-xs text-danger">{account.rejection_reason}</p> : null}
                <p className="text-xs text-text-muted">Updated {formatDate(account.updated_at)}</p>
              </div>
            ) : (
              <p className="text-sm text-text-muted">Add a bank or mobile-money account to receive payouts.</p>
            )}
          </SectionCard>

          <SectionCard
            title={account ? "Update payout account" : "Add payout account"}
            description="Changes reset verification and require administrator review."
          >
            <form className="space-y-3" onSubmit={(event) => void saveAccount(event)}>
              <Select
                label="Method"
                value={accountForm.method}
                onChange={(event) => setAccountForm({ ...accountForm, method: event.target.value })}
              >
                <option value="bank_transfer">Bank transfer</option>
                <option value="mobile_money">Mobile money</option>
              </Select>
              <Input
                label="Account name"
                required
                value={accountForm.account_name}
                onChange={(event) => setAccountForm({ ...accountForm, account_name: event.target.value })}
              />
              <Input
                label="Account number"
                required
                value={accountForm.account_number}
                onChange={(event) => setAccountForm({ ...accountForm, account_number: event.target.value })}
                hint="Full number is masked immediately after saving."
              />
              {accountForm.method === "bank_transfer" ? (
                <Input
                  label="Bank name"
                  required
                  value={accountForm.bank_name}
                  onChange={(event) => setAccountForm({ ...accountForm, bank_name: event.target.value })}
                />
              ) : (
                <Input
                  label="Network"
                  value={accountForm.network}
                  onChange={(event) => setAccountForm({ ...accountForm, network: event.target.value })}
                  placeholder="M-Pesa, Airtel Money, Tigo Pesa"
                />
              )}
              <Button type="submit" loading={busy} icon={<Landmark size={14} />}>
                Save account
              </Button>
            </form>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
