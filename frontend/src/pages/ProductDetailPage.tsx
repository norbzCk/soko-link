import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Maximize2,
  Minus,
  PackageCheck,
  Plus,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Truck,
  X,
} from "lucide-react";
import logoUrl from "../assets/sokolink-logo.png";
import { apiRequest } from "../lib/http";
import { useAuth } from "../features/auth/AuthContext";
import { useCart } from "../features/auth/CartContext";
import { useToast } from "../components/ui/Toast";
import { Modal } from "../components/Modal";
import type { Product } from "../types/domain";
import { formatMoney, resolveImageUrl } from "../lib/format";
import { ProductCard } from "../components/ui/ProductCard";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { getPostLoginPath } from "../features/auth/authStorage";

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { addToCart, setIsOpen } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showLightbox, setShowLightbox] = useState(false);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);

  const isInsideApp = location.pathname.startsWith("/app");

  useEffect(() => {
    void load();
  }, [productId]);

  async function load() {
    if (!productId) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<Product>(`/products/${productId}`);
      setProduct(data);
      if (data.category) {
        const similar = await apiRequest<{ items: Product[] }>(
          `/products/public/search?category=${encodeURIComponent(data.category)}&limit=5`,
        ).catch(() => ({ items: [] as Product[] }));
        setSimilarProducts((similar.items || []).filter((p) => p.id !== data.id).slice(0, 4));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Product not found");
    } finally {
      setLoading(false);
    }
  }

  function handleCheckout() {
    if (!product) return;
    if (!user) {
      navigate("/login", {
        state: { from: `/app/checkout?product=${product.id}&quantity=${quantity}` },
      });
      return;
    }
    if (user.role !== "user") {
      toast("Only customer accounts can place orders.", "warning");
      return;
    }
    navigate(`/app/checkout?product=${product.id}&quantity=${quantity}`);
  }

  function handleAddToCart() {
    if (!product) return;
    addToCart({
      id: product.id,
      name: product.name || "Product",
      price: product.price || 0,
      image_url: product.image_url,
      seller_id: product.seller_id,
      seller_name: product.seller_name || null,
    });
    toast(`Added "${product.name || "Item"}" to your cart.`, "success");
    setIsOpen(true);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-brand/20 border-t-brand" />
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Loading product…</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[1.25rem] border border-border bg-surface p-8 text-center shadow-soft">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
            <X size={26} />
          </span>
          <h2 className="mt-4 font-display text-xl font-semibold text-text">Product unavailable</h2>
          <p className="mt-1 text-sm text-text-muted">{error || "This listing could not be found."}</p>
          <Link to="/" className="btn-primary mt-5 w-full">Back to marketplace</Link>
        </div>
      </div>
    );
  }

  const outOfStock = !(typeof product.stock === "number" && product.stock > 0);
  const imageUrl = resolveImageUrl(product.image_url);
  const sellerName = product.seller_name || product.seller?.business_name || "Independent seller";
  const verified = String(product.seller?.verification_status || "").toLowerCase() === "verified";
  const canPurchase = !user || user.role === "user";

  const content = (
    <div className="mx-auto max-w-7xl space-y-10">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => (isInsideApp ? navigate("/app/products") : navigate("/"))}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-brand"
        >
          <ArrowLeft size={16} />
          {isInsideApp ? "Back to catalogue" : "Back to marketplace"}
        </button>
        <button
          className="icon-btn !h-9 !w-9"
          aria-label="Share product"
          title="Share product"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(window.location.href)
              .then(() => toast("Product link copied.", "success"))
              .catch(() => toast("Could not copy the link.", "error"));
          }}
        >
          <Share2 size={16} />
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Gallery */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowLightbox(true)}
            className="group relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-[1.5rem] border border-border bg-surface-soft shadow-soft"
          >
            <img
              src={imageUrl}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
            <span className="absolute left-4 top-4 badge badge-brand !bg-white/90 !text-slate-700 backdrop-blur">
              {product.category || "General"}
            </span>
            <span className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-lg bg-slate-900/70 px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
              <Maximize2 size={13} /> Click to zoom
            </span>
          </button>
        </div>

        {/* Info */}
        <div className="space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {verified ? (
                <Badge tone="success" icon={<BadgeCheck size={12} />}>Verified seller</Badge>
              ) : (
                <Badge tone="neutral" icon={<Store size={12} />}>Marketplace seller</Badge>
              )}
              {outOfStock ? <Badge tone="danger">Out of stock</Badge> : <Badge tone="brand">Ready to ship</Badge>}
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight text-text sm:text-4xl">
              {product.name}
            </h1>

            <div className="mt-2 flex items-center gap-2 text-sm">
              {typeof product.rating_avg === "number" && product.rating_avg > 0 ? (
                <>
                  <span className="flex items-center gap-0.5 text-accent">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={14} className={i < Math.round(product.rating_avg || 0) ? "fill-current" : "opacity-30"} />
                    ))}
                  </span>
                  <span className="font-semibold text-text">{Number(product.rating_avg).toFixed(1)}</span>
                  {product.rating_count ? <span className="text-text-muted">({product.rating_count} reviews)</span> : null}
                </>
              ) : (
                <span className="text-text-muted">New listing · no reviews yet</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4 rounded-[1.25rem] border border-border bg-surface p-4 shadow-soft">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">Price</span>
              <span className="font-display text-3xl font-bold tracking-tight text-text">{formatMoney(product.price)}</span>
            </div>
            <div className="ml-auto text-right">
              <span className={`block text-[11px] font-semibold uppercase tracking-wide ${outOfStock ? "text-danger" : "text-success"}`}>
                {outOfStock ? "Unavailable" : "In stock"}
              </span>
              <span className="text-sm font-medium text-text-muted">
                {outOfStock ? "Check back soon" : `${product.stock} unit${product.stock === 1 ? "" : "s"} available`}
              </span>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Description</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              {product.description || "The seller has not added a description for this product yet."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5">
              <ShieldCheck size={17} className="shrink-0 text-brand" />
              <div>
                <p className="text-xs font-semibold text-text">Secure payment</p>
                <p className="text-[11px] text-text-muted">Confirmed by the platform</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5">
              <Truck size={17} className="shrink-0 text-brand" />
              <div>
                <p className="text-xs font-semibold text-text">Tracked delivery</p>
                <p className="text-[11px] text-text-muted">Follow your order live</p>
              </div>
            </div>
          </div>

          {/* Purchase */}
          {!canPurchase ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-brand/20 bg-brand-light px-3.5 py-3 text-xs text-brand">
              <Store size={16} className="mt-0.5 shrink-0" />
              You are signed in with a {String(user?.role || "").replace(/_/g, " ")} account. Buying is available on customer accounts.
            </div>
          ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 items-center rounded-xl border border-border bg-surface">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="flex h-full w-10 items-center justify-center text-text-muted transition-colors hover:text-brand"
                  aria-label="Decrease quantity"
                >
                  <Minus size={16} />
                </button>
                <span className="w-9 text-center font-display text-base font-semibold text-text">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(product.stock || 99, q + 1))}
                  className="flex h-full w-10 items-center justify-center text-text-muted transition-colors hover:text-brand"
                  aria-label="Increase quantity"
                >
                  <Plus size={16} />
                </button>
              </div>
              <Button
                className="flex-1"
                disabled={outOfStock}
                onClick={handleCheckout}
                icon={<PackageCheck size={17} />}
              >
                Checkout
              </Button>
              <Button
                variant="secondary"
                disabled={outOfStock}
                onClick={handleAddToCart}
                icon={<ShoppingBag size={17} />}
              >
                Add to cart
              </Button>
            </div>
            {outOfStock ? (
              <p className="text-xs font-medium text-danger">This product is currently out of stock.</p>
            ) : null}
          </div>
          )}

          {/* Seller */}
          <div className="rounded-[1.25rem] border border-border bg-surface p-4 shadow-soft">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light font-display text-base font-bold text-brand">
                {sellerName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{sellerName}</p>
                <p className="flex items-center gap-1 text-[11px] text-text-muted">
                  {verified ? <><CheckCircle2 size={11} className="text-success" /> Verified merchant</> : "Marketplace merchant"}
                </p>
              </div>
            </div>
            {product.seller?.region || product.seller?.area ? (
              <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-[11px] text-text-muted">
                <Store size={12} /> {[product.seller?.area, product.seller?.region].filter(Boolean).join(", ")}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Similar */}
      <section className="space-y-4 border-t border-border pt-8">
        <div className="flex items-end justify-between">
          <div>
            <span className="eyebrow">You may also like</span>
            <h2 className="section-title mt-1.5">Similar products</h2>
          </div>
        </div>
        {similarProducts.length ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {similarProducts.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onOpen={() => {
                  navigate(`/product/${p.id}`);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-surface-soft/50 py-8 text-center text-sm text-text-muted">
            No similar products at the moment.
          </p>
        )}
      </section>

      <Modal isOpen={showLightbox} onClose={() => setShowLightbox(false)} title={product.name}>
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl bg-surface-soft">
            <img src={imageUrl} alt={product.name} className="max-h-[70vh] w-full object-contain" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-text-muted">{product.category || "Product"}</p>
            <Button variant="secondary" size="sm" onClick={() => setShowLightbox(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );

  if (isInsideApp) {
    return <div className="py-4">{content}</div>;
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand p-1.5 shadow-sm">
              <img src={logoUrl} alt="Soko-Link" className="h-full w-full object-contain" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight text-text">Soko-Link</span>
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to={getPostLoginPath(user)} className="btn-primary btn-sm">
                Workspace <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost btn-sm">Sign in</Link>
                <Link to="/register/customer" className="btn-primary btn-sm">Create account</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="px-4 py-8 sm:px-6 lg:px-8">{content}</main>
    </div>
  );
}
