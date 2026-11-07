import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Lock,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { apiRequest } from "../lib/http";
import { useAuth } from "../features/auth/AuthContext";
import { useCart } from "../features/auth/CartContext";
import type { Order, PaymentMethod, Product } from "../types/domain";
import { formatMoney, resolveImageUrl } from "../lib/format";
import { Input, Select, Textarea } from "../components/ui/Field";
import { Button } from "../components/ui/Button";

interface CheckoutOrderResponse {
  orders?: Order[];
  created_group_count?: number;
  reused?: boolean;
}

export function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { cart, clearCart } = useCart();

  const productId = params.get("product");
  const quantity = Number(params.get("quantity") || 1);
  const isCartCheckout = !productId;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);

  const [formData, setFormData] = useState({
    delivery_address: user?.address || "",
    delivery_phone: user?.phone || "",
    delivery_notes: "",
    delivery_method: "Standard",
    payment_method: "",
    payment_phone: user?.phone || "",
  });

  const [success, setSuccess] = useState<{ orderIds: number[]; transactionIds: string[] } | null>(null);
  const [pendingMobileMoney, setPendingMobileMoney] = useState<{ transactionId: string; provider: string } | null>(null);

  async function pollTransaction(transactionId: string, attempts = 20, delayMs = 3000): Promise<string> {
    for (let i = 0; i < attempts; i++) {
      const txn = await apiRequest<{ status: string }>(`/payments/transaction/${transactionId}`);
      if (txn.status !== "processing" && txn.status !== "pending") {
        return txn.status;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return "processing";
  }

  const checkoutItems = useMemo(() => {
    if (!isCartCheckout) {
      return product
        ? [
            {
              id: product.id,
              name: product.name,
              category: product.category,
              image_url: product.image_url,
              price: Number(product.price || 0),
              qty: Math.max(1, quantity),
              seller_id: product.seller_id ?? null,
            },
          ]
        : [];
    }

    return cart.map((item) => ({
      id: item.id,
      name: item.name,
      category: undefined,
      image_url: item.image_url,
      price: Number(item.price || 0),
      qty: Math.max(1, item.qty),
      seller_id: item.seller_id ?? null,
    }));
  }, [cart, isCartCheckout, product, quantity]);

  useEffect(() => {
    if (isCartCheckout && cart.length === 0) {
      navigate("/app/products");
      return;
    }
    void load();
  }, [cart.length, isCartCheckout, productId, navigate]);

  async function load() {
    try {
      const methodsPromise = apiRequest<{ payment_methods: PaymentMethod[] }>("/payments/methods/public");
      const productPromise = productId ? apiRequest<Product>(`/products/${productId}`) : Promise.resolve(null);
      const [productData, methodsData] = await Promise.all([productPromise, methodsPromise]);
      setProduct(productData);
      setMethods(methodsData.payment_methods || []);
      if (methodsData.payment_methods?.length) {
        setFormData((prev) => ({ ...prev, payment_method: methodsData.payment_methods[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load checkout data");
    } finally {
      setLoading(false);
    }
  }

  const total = useMemo(
    () => checkoutItems.reduce((sum, item) => sum + item.price * item.qty, 0),
    [checkoutItems],
  );

  const sellerGroupCount = useMemo(() => {
    const groups = new Set(checkoutItems.map((item) => String(item.seller_id ?? `product-${item.id}`)));
    return Math.max(groups.size, 1);
  }, [checkoutItems]);

  const estimatedDeliveryFee = useMemo(() => {
    if (formData.delivery_method === "Pickup") return 0;
    return formData.delivery_method === "Express" ? sellerGroupCount * 5000 : sellerGroupCount * 2000;
  }, [formData.delivery_method, sellerGroupCount]);

  const grandTotal = total + estimatedDeliveryFee;

  async function handleConfirmOrder() {
    if (!checkoutItems.length) return;
    setSubmitting(true);
    setError("");

    try {
      const requestKey = `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const orderResponse = await apiRequest<CheckoutOrderResponse>("/orders/", {
        method: "POST",
        headers: {
          "Idempotency-Key": requestKey,
        },
        body: {
          ...(isCartCheckout
            ? {
                items: checkoutItems.map((item) => ({
                  product_id: item.id,
                  quantity: item.qty,
                })),
              }
            : {
                product_id: checkoutItems[0].id,
                quantity: checkoutItems[0].qty,
              }),
          delivery_address: formData.delivery_address,
          delivery_phone: formData.delivery_phone,
          delivery_notes: formData.delivery_notes,
          delivery_method: formData.delivery_method,
        },
      });

      const createdOrders = Array.isArray(orderResponse.orders) ? orderResponse.orders : [];
      if (!createdOrders.length) {
        throw new Error("Checkout did not return any created orders");
      }

      const transactionIds: string[] = [];
      for (const order of createdOrders) {
        const paymentKey = `${requestKey}:payment:${order.id}`;
        const amount = Number(order.total || 0);
        if (["mpesa", "airtel_money", "tigopesa"].includes(formData.payment_method)) {
          const payResponse = await apiRequest<{ transaction_id: string; status: string }>(
            `/payments/mobile-money/stk-push?phone_number=${encodeURIComponent(formData.payment_phone)}&amount=${amount}&order_id=${order.id}&provider=${encodeURIComponent(formData.payment_method)}`,
            {
              method: "POST",
              headers: {
                "Idempotency-Key": paymentKey,
              },
            },
          );
          transactionIds.push(payResponse.transaction_id);
          setPendingMobileMoney({ transactionId: payResponse.transaction_id, provider: formData.payment_method });
          const finalStatus = await pollTransaction(payResponse.transaction_id);
          if (finalStatus === "failed") {
            throw new Error(
              `Your ${formData.payment_method} payment was not completed. You can retry from the Payments page.`,
            );
          }
          setPendingMobileMoney(null);
        } else {
          const payResponse = await apiRequest<{ transaction_id: string }>("/payments/initiate", {
            method: "POST",
            headers: {
              "Idempotency-Key": paymentKey,
            },
            body: {
              order_id: order.id,
              amount,
              payment_method: formData.payment_method,
              phone_number: formData.payment_phone || null,
            },
          });
          transactionIds.push(payResponse.transaction_id);
        }
      }

      if (isCartCheckout) {
        clearCart();
      }
      setSuccess({ orderIds: createdOrders.map((order) => order.id), transactionIds });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process order. Please try again.");
    } finally {
      setSubmitting(false);
      setPendingMobileMoney(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-brand/20 border-t-brand" />
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Preparing checkout…</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[1.5rem] border border-border bg-surface p-7 text-center shadow-soft sm:p-10"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10 text-success">
            <CheckCircle2 size={32} />
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">Order confirmed</h1>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            {success.orderIds.length === 1 ? (
              <>Your order <span className="font-semibold text-text">#{success.orderIds[0]}</span> has been placed successfully.</>
            ) : (
              <>Your orders <span className="font-semibold text-text">{success.orderIds.map((id) => `#${id}`).join(", ")}</span> have been placed successfully.</>
            )}
          </p>
          {success.transactionIds.length ? (
            <p className="mt-2 break-all text-xs text-text-muted">
              Transaction IDs: <span className="font-mono font-semibold text-brand">{success.transactionIds.join(", ")}</span>
            </p>
          ) : null}
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            <Button onClick={() => navigate("/app/orders")} iconRight={<ArrowRight size={15} />}>
              Track orders
            </Button>
            <Button variant="secondary" onClick={() => navigate("/")}>
              Back to marketplace
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  const isMobileMoney = ["mpesa", "airtel_money", "tigopesa"].includes(formData.payment_method);
  const canSubmit =
    !submitting &&
    Boolean(formData.payment_method) &&
    (formData.delivery_method === "Pickup" || Boolean(formData.delivery_address)) &&
    checkoutItems.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-brand"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted">
          <Lock size={13} className="text-success" /> Secure checkout
        </span>
      </div>

      <div>
        <span className="eyebrow">Checkout</span>
        <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">Complete your order</h1>
        <p className="mt-1 text-sm text-text-muted">
          {isCartCheckout
            ? "Review your cart, confirm delivery details, and pay for every seller order created from this checkout."
            : "Confirm your delivery details and choose a payment method to continue."}
        </p>
      </div>

      {error ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-xs font-medium text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[1.35fr_0.85fr]">
        <div className="space-y-5">
          <section className="rounded-[1.25rem] border border-border bg-surface p-4 shadow-soft sm:p-5">
            <h2 className="font-display text-base font-semibold text-text">Delivery details</h2>
            <p className="mt-0.5 text-xs text-text-muted">Where should we send your items?</p>

            <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  label={formData.delivery_method === "Pickup" ? "Pickup note (optional)" : "Delivery address"}
                  value={formData.delivery_address}
                  onChange={(e) => setFormData((p) => ({ ...p, delivery_address: e.target.value }))}
                  placeholder="Street, building, area, city"
                  required={formData.delivery_method !== "Pickup"}
                />
              </div>
              <Input
                label="Contact phone"
                type="tel"
                value={formData.delivery_phone}
                onChange={(e) => setFormData((p) => ({ ...p, delivery_phone: e.target.value }))}
                placeholder="+255…"
                required
              />
              <Select
                label="Delivery method"
                value={formData.delivery_method}
                onChange={(e) => setFormData((p) => ({ ...p, delivery_method: e.target.value }))}
              >
                <option value="Standard">Standard · 2–3 days</option>
                <option value="Express">Express · next day</option>
                <option value="Pickup">Store pickup · free</option>
              </Select>
              <div className="sm:col-span-2">
                <Textarea
                  label="Additional notes (optional)"
                  rows={2}
                  value={formData.delivery_notes}
                  onChange={(e) => setFormData((p) => ({ ...p, delivery_notes: e.target.value }))}
                  placeholder="Special instructions for the delivery agent…"
                />
              </div>
            </div>
          </section>

          <section className="rounded-[1.25rem] border border-border bg-surface p-4 shadow-soft sm:p-5">
            <h2 className="font-display text-base font-semibold text-text">Payment method</h2>
            <p className="mt-0.5 text-xs text-text-muted">Choose how you would like to pay.</p>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {methods.map((method) => {
                const active = formData.payment_method === method.id;
                const mobile = method.type === "mobile_money";
                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, payment_method: method.id }))}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                      active
                        ? "border-brand bg-brand-light ring-1 ring-brand/20"
                        : "border-border bg-surface hover:border-brand/30"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        active ? "bg-brand text-white" : "bg-surface-soft text-text-muted"
                      }`}
                    >
                      {mobile ? <Smartphone size={17} /> : <CreditCard size={17} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-text">{method.name}</span>
                      <span className="block text-[10px] font-medium uppercase tracking-wide text-text-muted">
                        {method.type.replace("_", " ")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {isMobileMoney ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3.5 space-y-3 rounded-xl border border-brand/15 bg-brand-light p-3.5"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-brand">
                  <ShieldCheck size={15} />
                  Mobile money secure checkout
                </div>
                <Input
                  label={`${formData.payment_method.replace(/_/g, " ")} number`}
                  value={formData.payment_phone}
                  onChange={(e) => setFormData((p) => ({ ...p, payment_phone: e.target.value }))}
                  placeholder="+255…"
                />
                <p className="text-[11px] leading-relaxed text-text-muted">
                  You will receive a prompt on your phone to authorise {formatMoney(grandTotal)}.
                </p>
              </motion.div>
            ) : null}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="rounded-[1.25rem] border border-border bg-surface p-4 shadow-soft sm:p-5">
            <h2 className="font-display text-base font-semibold text-text">Order summary</h2>

            <div className="mt-4 space-y-3">
              {checkoutItems.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-soft">
                    <img src={resolveImageUrl(item.image_url)} alt={item.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{item.name}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {item.qty} × {formatMoney(item.price)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-text">{formatMoney(item.price * item.qty)}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between text-text-muted">
                <span>Subtotal</span>
                <span className="font-medium text-text">{formatMoney(total)}</span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Estimated delivery</span>
                <span className="font-medium text-text">{formatMoney(estimatedDeliveryFee)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="font-display text-base font-semibold text-text">Total</span>
                <span className="font-display text-xl font-bold tracking-tight text-brand">{formatMoney(grandTotal)}</span>
              </div>
            </div>

            <Button
              onClick={handleConfirmOrder}
              disabled={!canSubmit}
              fullWidth
              loading={submitting}
              icon={!submitting ? <Lock size={15} /> : undefined}
              className="mt-4"
            >
              {submitting
                ? pendingMobileMoney
                  ? `Approve the ${pendingMobileMoney.provider} prompt…`
                  : "Processing…"
                : "Confirm & pay"}
            </Button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
              <ShieldCheck size={13} className="text-success" />
              Escrow protection enabled
            </p>
          </section>

          <div className="flex gap-2.5 rounded-xl border border-accent/20 bg-accent/10 p-3.5">
            <AlertCircle className="mt-0.5 shrink-0 text-[color:var(--accent-strong)]" size={16} />
            <div>
              <p className="text-xs font-semibold text-text">Buyer protection</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-text-muted">
                Your payment is held in escrow until you confirm receipt of the item.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
