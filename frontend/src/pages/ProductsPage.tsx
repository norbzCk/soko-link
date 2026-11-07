import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpDown,
  Box,
  DollarSign,
  Filter,
  ListFilter,
  Package,
  Plus,
  Search,
  Sparkles,
  Store,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
import { useCart } from "../features/auth/CartContext";
import { apiRequest } from "../lib/http";
import type { InventoryStats, Product, Provider } from "../types/domain";
import { Modal } from "../components/Modal";
import { ProductCard } from "../components/ui/ProductCard";
import { ImageUploader } from "../components/ui/ImageUploader";
import { Button } from "../components/ui/Button";
import { Input, Select, Textarea } from "../components/ui/Field";

interface ProductDraft {
  name: string;
  category: string;
  price: string;
  stock: string;
  description: string;
  image_url: string;
  provider_id: string;
  seller_id: string;
}

interface BusinessmanOption {
  id: number;
  business_name: string;
}

interface ProductInsight {
  description: string;
  suggested_price: number;
  seo_keywords: string[];
  confidence: number;
  trend_summary?: string | null;
  demand_level?: string | null;
  price_range?: {
    low?: number;
    high?: number;
    benchmark_average?: number;
  } | null;
}

interface InventoryForecastItem {
  product_id: number;
  product_name: string;
  current_stock: number;
  daily_burn_rate: number;
  days_left: number | string;
  weekly_demand?: number;
  recommended_restock?: number;
  risk_level?: string;
}

const emptyDraft: ProductDraft = {
  name: "",
  category: "",
  price: "",
  stock: "",
  description: "",
  image_url: "",
  provider_id: "",
  seller_id: "",
};

function formatMoney(value?: number) {
  return `TZS ${Number(value || 0).toLocaleString()}`;
}

function canManage(role?: string) {
  return ["admin", "super_admin", "owner", "seller"].includes(String(role || ""));
}

function canEditProduct(product: Product, userRole?: string, userId?: number | null) {
  const role = String(userRole || "");
  if (["admin", "super_admin", "owner"].includes(role)) return true;
  if (role === "seller") return Number(product.seller_id || 0) === Number(userId || 0);
  return false;
}

export function ProductsPage() {
  const { user } = useAuth();
  const { addToCart, setIsOpen } = useCart();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [businessmen, setBusinessmen] = useState<BusinessmanOption[]>([]);
  const [inventory, setInventory] = useState<InventoryStats | null>(null);
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "all");
  const [sort, setSort] = useState("featured");

  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [insight, setInsight] = useState<ProductInsight | null>(null);
  const [forecast, setForecast] = useState<InventoryForecastItem[]>([]);
  const [generatingInsight, setGeneratingInsight] = useState(false);

  const sellerMode = String(user?.role || "") === "seller";
  const adminMode = ["admin", "super_admin", "owner"].includes(String(user?.role || ""));
  const manager = canManage(user?.role);

  useEffect(() => {
    void load();
  }, [sellerMode, adminMode, user?.role, user?.id]);

  useEffect(() => {
    setSearch(searchParams.get("q") || searchParams.get("seller") || "");
    setCategory(searchParams.get("category") || "all");
  }, [searchParams]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const productPromise: Promise<{ items?: Product[] }> = manager
        ? apiRequest<Product[]>("/products/")
            .then((data) => ({ items: Array.isArray(data) ? data : [] }))
            .catch(() => ({ items: [] as Product[] }))
        : apiRequest<{ items: Product[] } | Product[]>("/products/marketplace")
            .then((data) => (Array.isArray(data) ? { items: data } : data))
            .catch(() =>
              apiRequest<Product[] | { items: Product[] }>("/products/public")
                .then((data) => (Array.isArray(data) ? { items: data } : data))
                .catch(() => ({ items: [] as Product[] })),
            );

      const providerPromise = manager
        ? apiRequest<Provider[]>("/providers/").catch(() => [])
        : Promise.resolve<Provider[]>([]);

      const inventoryPromise = !adminMode && !sellerMode
        ? Promise.resolve<InventoryStats | null>(null)
        : apiRequest<InventoryStats>("/products/inventory/stats").catch(() => null);

      const forecastPromise = sellerMode
        ? apiRequest<{ items: InventoryForecastItem[] }>("/business/inventory/forecast").catch(() => ({ items: [] as InventoryForecastItem[] }))
        : Promise.resolve<{ items: InventoryForecastItem[] }>({ items: [] });

      const [productData, providerData, inventoryData, forecastData] = await Promise.all([
        productPromise,
        providerPromise,
        inventoryPromise,
        forecastPromise,
      ]);
      setProducts(productData?.items || []);
      setProviders(Array.isArray(providerData) ? providerData : []);
      setInventory(inventoryData);
      setForecast(forecastData?.items || []);

      if (adminMode) {
        try {
          const sellers = await apiRequest<{ items: BusinessmanOption[] }>("/business/?limit=100");
          setBusinessmen(sellers.items || []);
        } catch {
          setBusinessmen([]);
        }
      }
    } catch (err) {
      setProducts([]);
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(products.map((item) => item.category).filter(Boolean) as string[])).sort()],
    [products],
  );

  const visibleProducts = useMemo(() => {
    let data = [...products];
    if (category !== "all") data = data.filter((item) => item.category === category);
    if (search.trim()) {
      const keyword = search.toLowerCase();
      data = data.filter((item) =>
        `${item.name || ""} ${item.category || ""} ${item.seller_name || ""} ${item.seller?.business_name || ""}`
          .toLowerCase()
          .includes(keyword),
      );
    }
    if (sort === "price_low") data.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sort === "price_high") data.sort((a, b) => (b.price || 0) - (a.price || 0));
    return data;
  }, [products, category, search, sort]);

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft);
    setInsight(null);
    setError("");
    setFlash("");
    setFormOpen(true);
  }

  function beginEdit(product: Product) {
    setEditingId(product.id);
    setDraft({
      name: String(product.name || ""),
      category: String(product.category || ""),
      price: String(product.price ?? ""),
      stock: String(product.stock ?? ""),
      description: String(product.description || ""),
      image_url: String(product.image_url || ""),
      provider_id: product.provider_id ? String(product.provider_id) : "",
      seller_id: product.seller_id ? String(product.seller_id) : "",
    });
    setInsight(null);
    setError("");
    setFlash("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setDraft(emptyDraft);
    setInsight(null);
  }

  async function generateInsight() {
    if (!draft.name.trim() || !draft.category.trim()) {
      setError("Enter a product name and category before generating insights.");
      return;
    }
    setGeneratingInsight(true);
    setError("");
    try {
      const data = await apiRequest<ProductInsight>("/products/ai-suggest", {
        method: "POST",
        body: {
          name: draft.name,
          category: draft.category,
          current_price: draft.price ? Number(draft.price) : null,
          stock: draft.stock ? Number(draft.stock) : null,
          description: draft.description || null,
          seller_area: user && "area" in user ? (user as never as { area?: string | null }).area : null,
        },
      });
      setInsight(data);
      setDraft((prev) => ({
        ...prev,
        description: data.description || prev.description,
        price: data.suggested_price ? String(Math.round(data.suggested_price)) : prev.price,
      }));
      setFlash("AI insight generated — review before saving.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate product insight");
    } finally {
      setGeneratingInsight(false);
    }
  }

  async function handleCreateOrUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFlash("");

    const payload = {
      name: draft.name.trim(),
      category: draft.category.trim(),
      price: Number(draft.price || 0),
      stock: Number(draft.stock || 0),
      description: draft.description.trim(),
      image_url: draft.image_url.trim() || null,
      provider_id: draft.provider_id ? Number(draft.provider_id) : null,
      seller_id: draft.seller_id ? Number(draft.seller_id) : null,
    };

    if (!payload.name || !payload.category || payload.price <= 0 || !payload.description) {
      setError("Please provide a product name, category, price, and description.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/products/${editingId}`, { method: "PUT", body: payload });
        setFlash("Product updated.");
      } else {
        await apiRequest("/products/", { method: "POST", body: payload });
        setFlash("Product listed.");
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Remove this product from your listings? You can restore it later.")) return;
    try {
      await apiRequest(`/products/${id}`, { method: "DELETE" });
      await load();
      setFlash("Product removed from listings.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete product");
    }
  }

  async function handleReactivate(id: number) {
    try {
      await apiRequest(`/products/${id}/reactivate`, { method: "POST" });
      await load();
      setFlash("Product restored and listed again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore product");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <section className="flex flex-col gap-4 rounded-[1.25rem] border border-border bg-surface p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <span className="eyebrow">
            <Store size={13} /> {manager ? "Catalogue workspace" : "Marketplace"}
          </span>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
            {manager ? "Your product catalogue" : "Browse the marketplace"}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-text-muted">
            {manager
              ? "List products, keep stock accurate, and keep your storefront looking its best."
              : "Discover products from trusted sellers and order with confidence."}
          </p>
        </div>
        {manager ? (
          <Button onClick={openCreate} icon={<Plus size={16} />} className="shrink-0">
            List new product
          </Button>
        ) : null}
      </section>

      {(error || flash) && (
        <div
          className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
            error ? "border-danger/25 bg-danger/10 text-danger" : "border-success/25 bg-success/10 text-success"
          }`}
        >
          {error || flash}
        </div>
      )}

      {/* Inventory stats */}
      {inventory ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Total products", value: inventory.total_products, icon: Box },
            { label: "Low stock", value: inventory.low_stock_count, icon: AlertTriangle },
            { label: "Out of stock", value: inventory.out_of_stock_count, icon: Package },
            { label: "Inventory value", value: formatMoney(inventory.total_value), icon: DollarSign },
          ].map((stat) => (
            <div key={stat.label} className="stat-card">
              <div className="flex items-center justify-between">
                <span>{stat.label}</span>
                <span className="text-brand">
                  <stat.icon size={16} />
                </span>
              </div>
              <strong className="!text-xl sm:!text-2xl">{stat.value}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {/* Forecast */}
      {sellerMode && forecast.length ? (
        <section className="rounded-[1.25rem] border border-border bg-surface shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-text">
                <Sparkles size={16} className="text-brand" /> Inventory forecast
              </h2>
              <p className="mt-0.5 text-xs text-text-muted">Products that may need restocking soon.</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {forecast.slice(0, 4).map((item) => (
              <div key={item.product_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{item.product_name}</p>
                  <p className="mt-0.5 flex items-center gap-3 text-xs text-text-muted">
                    <span className="inline-flex items-center gap-1"><Box size={12} /> {item.current_stock} in stock</span>
                    <span className="inline-flex items-center gap-1 text-success"><TrendingUp size={12} /> {item.daily_burn_rate.toFixed(1)}/day</span>
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={`badge ${
                      item.risk_level === "critical"
                        ? "badge-danger"
                        : item.risk_level === "watch"
                          ? "badge-accent"
                          : "badge-success"
                    }`}
                  >
                    {item.risk_level || "healthy"}
                  </span>
                  <div className="text-right">
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Restock</span>
                    <span className="text-sm font-bold text-text">+{item.recommended_restock || 0}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-[1.25rem] border border-border bg-surface p-3 shadow-soft lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products, sellers, categories…"
            aria-label="Search products"
            className="h-10 w-full rounded-xl border border-border bg-surface-soft pl-10 pr-4 text-sm text-text outline-none transition-colors placeholder:text-text-muted focus:border-brand focus:bg-surface"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-border bg-surface-soft px-3">
            <Filter size={14} className="text-text-muted" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
              className="h-10 bg-transparent text-sm font-medium text-text outline-none"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-border bg-surface-soft px-3">
            <ArrowUpDown size={14} className="text-text-muted" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort products"
              className="h-10 bg-transparent text-sm font-medium text-text outline-none"
            >
              <option value="featured">Best match</option>
              <option value="price_low">Price: low to high</option>
              <option value="price_high">Price: high to low</option>
            </select>
          </label>
          <span className="hidden items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs font-medium text-text-muted sm:flex">
            <ListFilter size={13} /> {visibleProducts.length} items
          </span>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-[1.25rem] border border-border bg-surface">
              <div className="shimmer aspect-square bg-surface-soft" />
              <div className="space-y-2 p-4">
                <div className="shimmer h-3 w-24 rounded bg-surface-soft" />
                <div className="shimmer h-4 w-full rounded bg-surface-soft" />
                <div className="shimmer h-5 w-20 rounded bg-surface-soft" />
              </div>
            </div>
          ))}
        </div>
      ) : visibleProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-border bg-surface-soft/50 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-text-muted shadow-soft">
            <Search size={26} />
          </span>
          <h3 className="mt-4 font-display text-lg font-semibold text-text">No products found</h3>
          <p className="mt-1 max-w-sm text-sm text-text-muted">
            Try a different search or category. {manager ? "You can also list a new product." : ""}
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="secondary" onClick={() => { setSearch(""); setCategory("all"); }}>
              Clear filters
            </Button>
            {manager ? <Button onClick={openCreate} icon={<Plus size={15} />}>List product</Button> : null}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {visibleProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onOpen={() => navigate(`/app/product/${product.id}`)}
              onAdd={
                manager
                  ? undefined
                  : () => {
                      addToCart({
                        id: product.id,
                        name: product.name || "Product",
                        price: product.price || 0,
                        image_url: product.image_url,
                        seller_id: product.seller_id,
                        seller_name: product.seller_name || null,
                      });
                      setIsOpen(true);
                    }
              }
              canManage={canEditProduct(product, user?.role, user?.id)}
              onEdit={() => beginEdit(product)}
              onDelete={() => handleDelete(product.id)}
              onReactivate={() => handleReactivate(product.id)}
            />
          ))}
        </div>
      )}

      {/* Compact product editor */}
      <Modal
        isOpen={formOpen}
        onClose={closeForm}
        title={editingId ? `Edit product #${editingId}` : "List a new product"}
      >
        <form onSubmit={handleCreateOrUpdate} className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-soft/60 px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold text-text">Let AI help write the listing</p>
              <p className="text-[11px] text-text-muted">Suggests a description and price from the name and category.</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={generatingInsight}
              onClick={() => void generateInsight()}
              icon={<Sparkles size={14} />}
            >
              {generatingInsight ? "Thinking…" : "Suggest"}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Product name"
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. High-performance solar panel"
              required
              className="sm:col-span-2"
            />
            <Input
              label="Category"
              value={draft.category}
              onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))}
              placeholder="e.g. Electronics"
              required
            />
            <Input
              label="Price (TZS)"
              type="number"
              min={1}
              value={draft.price}
              onChange={(e) => setDraft((prev) => ({ ...prev, price: e.target.value }))}
              placeholder="0"
              required
            />
            <Input
              label="Stock quantity"
              type="number"
              min={0}
              value={draft.stock}
              onChange={(e) => setDraft((prev) => ({ ...prev, stock: e.target.value }))}
              placeholder="0"
              required
            />
            <Select
              label="Supplier (optional)"
              value={draft.provider_id}
              onChange={(e) => setDraft((prev) => ({ ...prev, provider_id: e.target.value }))}
            >
              <option value="">No supplier</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </Select>

            {adminMode && businessmen.length ? (
              <Select
                label="Assign to seller"
                value={draft.seller_id}
                onChange={(e) => setDraft((prev) => ({ ...prev, seller_id: e.target.value }))}
                className="sm:col-span-2"
              >
                <option value="">Unassigned</option>
                {businessmen.map((seller) => (
                  <option key={seller.id} value={seller.id}>{seller.business_name}</option>
                ))}
              </Select>
            ) : null}

            <Textarea
              label="Description"
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Specifications, warranty, features…"
              required
              className="sm:col-span-2"
            />

            <div className="sm:col-span-2">
              <ImageUploader
                value={draft.image_url}
                onChange={(url) => setDraft((prev) => ({ ...prev, image_url: url }))}
              />
            </div>
          </div>

          {insight ? (
            <div className="rounded-xl border border-brand/20 bg-brand-light p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-brand">
                  <Sparkles size={13} /> AI price insight
                </p>
                <span className="text-[11px] font-medium text-brand">
                  {Math.round((insight.confidence || 0) * 100)}% confidence
                </span>
              </div>
              {insight.trend_summary ? (
                <p className="mt-1.5 text-xs text-text-muted">{insight.trend_summary}</p>
              ) : null}
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-lg bg-surface px-2.5 py-2">
                  <span className="block text-[10px] uppercase tracking-wide text-text-muted">Suggested</span>
                  <span className="font-semibold text-text">{formatMoney(insight.suggested_price)}</span>
                </div>
                <div className="rounded-lg bg-surface px-2.5 py-2">
                  <span className="block text-[10px] uppercase tracking-wide text-text-muted">Range</span>
                  <span className="font-semibold text-text">
                    {formatMoney(insight.price_range?.low)} – {formatMoney(insight.price_range?.high)}
                  </span>
                </div>
                <div className="rounded-lg bg-surface px-2.5 py-2">
                  <span className="block text-[10px] uppercase tracking-wide text-text-muted">Demand</span>
                  <span className="font-semibold capitalize text-text">{insight.demand_level || "—"}</span>
                </div>
                <div className="rounded-lg bg-surface px-2.5 py-2">
                  <span className="block text-[10px] uppercase tracking-wide text-text-muted">Benchmark</span>
                  <span className="font-semibold text-text">{formatMoney(insight.price_range?.benchmark_average)}</span>
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-xs font-medium text-danger">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editingId ? "Save changes" : "Publish listing"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
