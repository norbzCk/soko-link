import { useState } from "react";
import type { FormEvent } from "react";
import {
  Archive,
  Copy,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { PageIntro, SectionCard, EmptyState } from "../components/ui/PageSections";
import { Button } from "../components/ui/Button";
import { Input, Select, Textarea } from "../components/ui/Field";
import { ImageUploader } from "../components/ui/ImageUploader";
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
import type { InventoryMovement, SellerProduct, SellerProductStatus } from "../types/seller";

type Tab = "products" | "inventory" | "movements";

interface ProductFormState {
  name: string;
  category: string;
  price: string;
  stock: string;
  description: string;
  unit: string;
  low_stock_threshold: string;
  image_url: string;
}

const emptyForm: ProductFormState = {
  name: "",
  category: "",
  price: "",
  stock: "0",
  description: "",
  unit: "piece",
  low_stock_threshold: "5",
  image_url: "",
};

export function SellerCatalogPage() {
  const [tab, setTab] = useState<Tab>("products");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SellerProduct | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [adjusting, setAdjusting] = useState<SellerProduct | null>(null);
  const [adjustment, setAdjustment] = useState({ movement_type: "receipt", quantity: "", reason: "" });

  const productQuery = `/seller/products?limit=200${statusFilter ? `&status=${statusFilter}` : ""}`;
  const products = useSellerResource<{ items: SellerProduct[]; total: number }>(productQuery);
  const inventory = useSellerResource<{
    total_products: number;
    total_value: number;
    low_stock: number;
    out_of_stock: number;
    items: SellerProduct[];
  }>("/seller/inventory");
  const movements = useSellerResource<{ items: InventoryMovement[]; total: number }>(
    "/seller/inventory/movements?limit=100",
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
    setError("");
  }

  function openEdit(product: SellerProduct) {
    setEditing(product);
    setForm({
      name: product.name,
      category: product.category,
      price: String(product.price),
      stock: String(product.stock),
      description: product.description || "",
      unit: product.unit || "piece",
      low_stock_threshold: String(product.low_stock_threshold),
      image_url: product.image_url || "",
    });
    setShowForm(true);
    setError("");
  }

  async function saveProduct(event: FormEvent, submit: boolean) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setFlash("");
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        category: form.category,
        price: Number(form.price),
        description: form.description,
        unit: form.unit,
        low_stock_threshold: Number(form.low_stock_threshold || 5),
        image_url: form.image_url,
      };
      if (!editing) {
        body.stock = Number(form.stock || 0);
        body.submit = submit;
      }
      if (editing) {
        if (Number(form.price) !== editing.price) body.price = Number(form.price);
        await apiRequest(`/seller/products/${editing.id}`, { method: "PUT", body });
      } else {
        await apiRequest("/seller/products", { method: "POST", body });
      }
      setFlash(editing ? "Product updated." : submit ? "Product submitted for review." : "Draft saved.");
      setShowForm(false);
      await Promise.all([products.reload(), inventory.reload(), movements.reload()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save product.");
    } finally {
      setSaving(false);
    }
  }

  async function productAction(product: SellerProduct, action: "submit" | "archive" | "duplicate") {
    if (action === "archive" && !window.confirm("Archive this product and remove it from the storefront?")) return;
    setError("");
    setFlash("");
    try {
      await apiRequest(`/seller/products/${product.id}/${action}`, { method: "POST" });
      setFlash(
        action === "submit"
          ? "Submitted for review."
          : action === "archive"
            ? "Product archived."
            : "Draft copy created.",
      );
      await Promise.all([products.reload(), inventory.reload(), movements.reload()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    }
  }

  async function submitAdjustment(event: FormEvent) {
    event.preventDefault();
    if (!adjusting) return;
    setSaving(true);
    setError("");
    setFlash("");
    try {
      await apiRequest("/seller/inventory/adjust", {
        method: "POST",
        body: {
          product_id: adjusting.id,
          movement_type: adjustment.movement_type,
          quantity: Number(adjustment.quantity),
          reason: adjustment.reason,
        },
      });
      setFlash("Inventory updated and recorded in the movement ledger.");
      setAdjusting(null);
      setAdjustment({ movement_type: "receipt", quantity: "", reason: "" });
      await Promise.all([products.reload(), inventory.reload(), movements.reload()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update inventory.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Catalogue"
        title="Products & inventory"
        description="Drafts and edits are reviewed before they become visible. Every stock change is written to an auditable ledger."
        actions={
          <Button icon={<Plus size={15} />} onClick={openCreate}>
            New product
          </Button>
        }
      />

      {flash ? <SellerNotice>{flash}</SellerNotice> : null}
      {error ? <SellerError message={error} /> : null}

      <SellerTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "products", label: "Products", count: products.data?.total },
          { id: "inventory", label: "Inventory", count: inventory.data?.total_products },
          { id: "movements", label: "Stock ledger" },
        ]}
      />

      {showForm ? (
        <SectionCard
          title={editing ? `Edit ${editing.name}` : "Create product"}
          description={
            editing
              ? "Material changes to approved products are re-submitted for review. Stock edits must use inventory adjustments."
              : "Save as a draft or submit straight to marketplace review."
          }
          action={
            <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setShowForm(false)}>
              Close
            </Button>
          }
        >
          <form className="space-y-4" onSubmit={(event) => void saveProduct(event, true)}>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Product name"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              <Input
                label="Category"
                required
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              />
              <Input
                label="Unit price (TZS)"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.price}
                onChange={(event) => setForm({ ...form, price: event.target.value })}
              />
              {!editing ? (
                <Input
                  label="Opening stock"
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(event) => setForm({ ...form, stock: event.target.value })}
                  hint="Opening stock creates a receipt in the ledger."
                />
              ) : (
                <Input label="Current stock" value={String(editing.stock)} disabled hint="Use inventory actions to change stock." />
              )}
              <Input
                label="Unit"
                value={form.unit}
                onChange={(event) => setForm({ ...form, unit: event.target.value })}
                placeholder="piece, bag, carton"
              />
              <Input
                label="Low stock threshold"
                type="number"
                min="0"
                value={form.low_stock_threshold}
                onChange={(event) => setForm({ ...form, low_stock_threshold: event.target.value })}
              />
            </div>
            <Textarea
              label="Description"
              rows={4}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
            <ImageUploader
              value={form.image_url}
              onChange={(url) => setForm({ ...form, image_url: url })}
              label="Product image"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={saving} icon={<Send size={14} />}>
                {editing ? "Save changes" : "Submit for review"}
              </Button>
              {!editing ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={(event) => void saveProduct(event as unknown as FormEvent, false)}
                >
                  Save draft
                </Button>
              ) : null}
            </div>
          </form>
        </SectionCard>
      ) : null}

      {tab === "products" ? (
        <SectionCard
          title="Catalogue"
          description="Drafts, pending edits, rejected listings and live products."
          action={
            <div className="flex gap-2">
              <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter status">
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="pending">Pending review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="archived">Archived</option>
              </Select>
              <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void products.reload()}>
                Refresh
              </Button>
            </div>
          }
        >
          {products.loading ? (
            <SellerLoading label="Loading catalogue..." />
          ) : products.error ? (
            <SellerError message={products.error} onRetry={products.reload} />
          ) : products.data && products.data.items.length === 0 ? (
            <EmptyState title="No products found" description="Create your first product to start selling." icon={<Package size={22} />} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-muted">
                    <th className="px-2 py-2">Product</th>
                    <th className="px-2 py-2">Price</th>
                    <th className="px-2 py-2">Stock</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Updated</th>
                    <th className="px-2 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.data?.items.map((product) => (
                    <tr key={product.id} className="border-b border-border/60 align-top last:border-0">
                      <td className="px-2 py-3">
                        <p className="font-semibold text-text">{product.name}</p>
                        <p className="text-xs text-text-muted">{product.category}</p>
                        {product.moderation_reason ? (
                          <p className="mt-1 max-w-xs text-xs text-danger">{product.moderation_reason}</p>
                        ) : null}
                      </td>
                      <td className="px-2 py-3">{formatMoney(product.price)}</td>
                      <td className="px-2 py-3">
                        <span className={product.is_low_stock ? "font-bold text-amber-600" : ""}>{product.stock}</span>
                        <span className="text-xs text-text-muted"> / {product.low_stock_threshold} alert</span>
                      </td>
                      <td className="px-2 py-3">
                        <span className={`badge border ${sellerStatusTone(product.status)}`}>{product.status}</span>
                      </td>
                      <td className="px-2 py-3 text-text-muted">{formatDate(product.submitted_at || product.approved_at)}</td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => openEdit(product)}>
                            Edit
                          </Button>
                          {product.status === "draft" || product.status === "rejected" ? (
                            <Button size="sm" variant="secondary" icon={<Send size={13} />} onClick={() => void productAction(product, "submit")}>
                              Submit
                            </Button>
                          ) : null}
                          {product.status !== "archived" ? (
                            <Button size="sm" variant="ghost" icon={<Archive size={13} />} onClick={() => void productAction(product, "archive")}>
                              Archive
                            </Button>
                          ) : null}
                          <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => void productAction(product, "duplicate")}>
                            Copy
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}

      {tab === "inventory" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Products", value: inventory.data?.total_products ?? 0 },
              { label: "Stock value", value: formatMoney(inventory.data?.total_value ?? 0) },
              { label: "Low stock", value: inventory.data?.low_stock ?? 0 },
              { label: "Out of stock", value: inventory.data?.out_of_stock ?? 0 },
            ].map((item) => (
              <div key={item.label} className="glass-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{item.label}</p>
                <p className="mt-1 font-display text-xl font-bold">{item.value}</p>
              </div>
            ))}
          </div>
          <SectionCard title="Stock levels" description="Receipts, damage, loss, returns and signed corrections are recorded against your account.">
            {inventory.loading ? (
              <SellerLoading label="Loading inventory..." />
            ) : inventory.error ? (
              <SellerError message={inventory.error} onRetry={inventory.reload} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-muted">
                      <th className="px-2 py-2">Product</th>
                      <th className="px-2 py-2">Stock</th>
                      <th className="px-2 py-2">Reserved</th>
                      <th className="px-2 py-2">Alert at</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2 text-right">Adjust</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.data?.items.map((product) => (
                      <tr key={product.id} className="border-b border-border/60 last:border-0">
                        <td className="px-2 py-3">
                          <p className="font-semibold">{product.name}</p>
                          <p className="text-xs text-text-muted">{product.unit || "piece"}</p>
                        </td>
                        <td className={`px-2 py-3 ${product.is_low_stock ? "font-bold text-amber-600" : ""}`}>{product.stock}</td>
                        <td className="px-2 py-3">{product.reserved_stock}</td>
                        <td className="px-2 py-3">{product.low_stock_threshold}</td>
                        <td className="px-2 py-3">
                          <span className={`badge border ${sellerStatusTone(product.status)}`}>{product.status}</span>
                        </td>
                        <td className="px-2 py-3 text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<SlidersHorizontal size={13} />}
                            onClick={() => {
                              setAdjusting(product);
                              setAdjustment({ movement_type: "receipt", quantity: "", reason: "" });
                            }}
                          >
                            Adjust stock
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      ) : null}

      {tab === "movements" ? (
        <SectionCard
          title="Stock movement ledger"
          description="Append-only history of all inventory changes."
          action={<Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void movements.reload()}>Refresh</Button>}
        >
          {movements.loading ? (
            <SellerLoading label="Loading ledger..." />
          ) : movements.error ? (
            <SellerError message={movements.error} onRetry={movements.reload} />
          ) : movements.data && movements.data.items.length === 0 ? (
            <EmptyState title="No stock movements" description="Adjustments and sales will appear here." icon={<Trash2 size={22} />} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-muted">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Product</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Change</th>
                    <th className="px-2 py-2">Balance</th>
                    <th className="px-2 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.data?.items.map((movement) => (
                    <tr key={movement.id} className="border-b border-border/60 last:border-0">
                      <td className="px-2 py-3 text-text-muted">{formatDate(movement.created_at)}</td>
                      <td className="px-2 py-3">#{movement.product_id}</td>
                      <td className="px-2 py-3 capitalize">{movement.movement_type}</td>
                      <td className={`px-2 py-3 font-bold ${movement.quantity_delta < 0 ? "text-danger" : "text-emerald-600"}`}>
                        {movement.quantity_delta > 0 ? "+" : ""}
                        {movement.quantity_delta}
                      </td>
                      <td className="px-2 py-3">{movement.balance_after}</td>
                      <td className="px-2 py-3 text-text-muted">{movement.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}

      {adjusting ? (
        <SectionCard
          title={`Adjust stock · ${adjusting.name}`}
          description={`Current balance: ${adjusting.stock}. Negative adjustments cannot exceed available stock.`}
          action={<Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setAdjusting(null)}>Close</Button>}
        >
          <form className="grid gap-4 md:grid-cols-3" onSubmit={(event) => void submitAdjustment(event)}>
            <Select
              label="Movement type"
              value={adjustment.movement_type}
              onChange={(event) => setAdjustment({ ...adjustment, movement_type: event.target.value })}
            >
              <option value="receipt">Receipt (add stock)</option>
              <option value="return">Customer return (add stock)</option>
              <option value="damage">Damage (remove stock)</option>
              <option value="loss">Loss (remove stock)</option>
              <option value="adjustment">Adjustment (+ / -)</option>
              <option value="correction">Correction (+ / -)</option>
            </Select>
            <Input
              label="Quantity"
              type="number"
              required
              value={adjustment.quantity}
              onChange={(event) => setAdjustment({ ...adjustment, quantity: event.target.value })}
              hint="Use a negative value for signed adjustments only."
            />
            <Input
              label="Reason"
              value={adjustment.reason}
              onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })}
              hint="Required for damage, loss and returns."
            />
            <div className="md:col-span-3">
              <Button type="submit" loading={saving}>Save movement</Button>
            </div>
          </form>
        </SectionCard>
      ) : null}
    </div>
  );
}
