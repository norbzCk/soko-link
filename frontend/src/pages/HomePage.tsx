import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Globe2,
  Mail,
  MapPin,
  Menu,
  Moon,
  PackageCheck,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Sun,
  Truck,
  X,
} from "lucide-react";
import logoUrl from "../assets/sokolink-logo.png";
import { useAuth } from "../features/auth/AuthContext";
import { useTheme } from "../features/auth/ThemeContext";
import { useCart } from "../features/auth/CartContext";
import { apiRequest } from "../lib/http";
import { ProductCard } from "../components/ui/ProductCard";
import { Input, Textarea } from "../components/ui/Field";
import { Button } from "../components/ui/Button";
import { getPostLoginPath } from "../features/auth/authStorage";
import type { Product } from "../types/domain";

type ProductSearchResponse = {
  items: Product[];
  total: number;
  categories?: string[];
};

const emptyRfq = {
  company_name: "",
  contact_name: "",
  email: "",
  phone: "",
  product_interest: "",
  quantity: "1",
  target_budget: "",
  notes: "",
};

const VALUE_PROPS = [
  {
    icon: ShieldCheck,
    title: "Verified sellers",
    copy: "Every merchant is reviewed before they can list, so you know who you are buying from.",
  },
  {
    icon: Truck,
    title: "Tracked fulfilment",
    copy: "Follow orders from dispatch to doorstep with live delivery status and support.",
  },
  {
    icon: CreditCard,
    title: "Secure payments",
    copy: "Mobile money, bank transfer, and cash options with trusted payment confirmation.",
  },
];

const STEPS = [
  {
    icon: Search,
    title: "Discover",
    copy: "Search the catalogue or tell us what you need with a sourcing request.",
  },
  {
    icon: PackageCheck,
    title: "Order",
    copy: "Compare trusted sellers, add to cart, and confirm delivery details.",
  },
  {
    icon: Truck,
    title: "Receive",
    copy: "Track your delivery in real time and confirm when it arrives.",
  },
];

export function HomePage() {
  const { token, user } = useAuth();
  const { addToCart, setIsOpen } = useCart();
  const { toggleTheme, effectiveTheme } = useTheme();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>(["all"]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [displayCount, setDisplayCount] = useState(8);
  const [loading, setLoading] = useState(true);
  const [rfqDraft, setRfqDraft] = useState({ ...emptyRfq });
  const [rfqStatus, setRfqStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [submittingRfq, setSubmittingRfq] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [items, categoryData] = await Promise.all([
        apiRequest<Product[]>("/products/public", { auth: false }),
        apiRequest<{ categories: string[] }>("/products/public/categories", { auth: false }).catch(() => ({ categories: [] })),
      ]);
      setProducts(Array.isArray(items) ? items : []);
      setCategories(["all", ...(categoryData?.categories || [])]);
    } catch {
      setProducts([]);
      setCategories(["all"]);
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((item) => {
      const inCategory = activeCategory === "all" || (item.category || "").trim() === activeCategory;
      if (!inCategory) return false;
      if (!query) return true;
      return `${item.name || ""} ${item.category || ""} ${item.description || ""} ${item.seller_name || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [products, activeCategory, search]);

  const displayedItems = filteredItems.slice(0, displayCount);
  const liveCategoryCount = Math.max(categories.length - 1, 0);

  function scrollToProducts() {
    document.getElementById("products")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    scrollToProducts();
  }

  function handleCategory(category: string) {
    setActiveCategory(category);
    setDisplayCount(8);
    scrollToProducts();
  }

  async function submitRfq(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRfqStatus(null);
    setSubmittingRfq(true);
    try {
      await apiRequest("/rfq/", {
        method: "POST",
        auth: false,
        body: { ...rfqDraft, quantity: Number(rfqDraft.quantity || 1) },
      });
      setRfqStatus({
        tone: "success",
        message: "Request received. Verified sellers can now respond to your sourcing needs.",
      });
      setRfqDraft({ ...emptyRfq });
    } catch (err) {
      setRfqStatus({
        tone: "error",
        message: err instanceof Error ? err.message : "Could not send your request. Please try again.",
      });
    } finally {
      setSubmittingRfq(false);
    }
  }

  const workspaceHref = user ? getPostLoginPath(user) : "/login";

  const navigation: Array<{ label: string; href?: string; to?: string }> = [
    { label: "Marketplace", href: "#products" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Sourcing", href: "#sourcing" },
    { label: "Sell on Soko-Link", to: "/register/business" },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg font-sans text-text">
      {/* ---------------- Header ---------------- */}
      <header className="sticky top-0 z-50 border-b border-border bg-surface/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand p-1.5 shadow-sm">
              <img src={logoUrl} alt="Soko-Link" className="h-full w-full object-contain" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-lg font-bold tracking-tight text-text">Soko-Link</span>
              <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">Smart marketplace</span>
            </span>
          </Link>

          <nav className="ml-6 hidden items-center gap-1 lg:flex">
            {navigation.map((item) =>
              item.to ? (
                <Link
                  key={item.label}
                  to={item.to}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.label}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
                >
                  {item.label}
                </a>
              ),
            )}
          </nav>

          <form onSubmit={handleSearch} className="ml-auto hidden max-w-md flex-1 md:block">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products, categories, or sellers…"
                aria-label="Search the marketplace"
                className="h-10 w-full rounded-xl border border-border bg-surface-soft pl-10 pr-4 text-sm text-text outline-none transition-colors placeholder:text-text-muted focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/15"
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="icon-btn !h-10 !w-10"
            >
              {effectiveTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {token && user ? (
              <Link to={workspaceHref} className="btn-primary hidden sm:inline-flex">
                Go to workspace
                <ArrowRight size={15} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost hidden sm:inline-flex">
                  Sign in
                </Link>
                <Link to="/register/customer" className="btn-primary hidden sm:inline-flex">
                  Create account
                </Link>
              </>
            )}

            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Open menu"
              className="icon-btn !h-10 !w-10 lg:hidden"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen ? (
          <div className="border-t border-border bg-surface px-4 pb-4 pt-3 lg:hidden">
            <form onSubmit={handleSearch} className="relative mb-3 md:hidden">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the marketplace…"
                className="h-10 w-full rounded-xl border border-border bg-surface-soft pl-10 pr-4 text-sm outline-none focus:border-brand"
              />
            </form>
            <div className="grid gap-1">
              {navigation.map((item) =>
                item.to ? (
                  <Link
                    key={item.label}
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-soft hover:text-text"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-soft hover:text-text"
                  >
                    {item.label}
                  </a>
                ),
              )}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link to="/login" onClick={() => setMenuOpen(false)} className="btn-secondary w-full">
                  Sign in
                </Link>
                <Link to="/register/customer" onClick={() => setMenuOpen(false)} className="btn-primary w-full">
                  Create account
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <main>
        {/* ---------------- Hero ---------------- */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(14,90,167,0.10),transparent_42%),radial-gradient(circle_at_85%_80%,rgba(239,159,47,0.12),transparent_40%)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="max-w-xl"
            >
              <span className="eyebrow">
                <Sparkles size={13} /> The smarter way to source
              </span>
              <h1 className="mt-4 font-display text-4xl font-bold leading-[1.08] tracking-tight text-text sm:text-5xl lg:text-[3.4rem]">
                Everything your business needs, from sellers you can trust.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-text-muted sm:text-lg">
                Discover products from verified merchants across the region, order with confidence,
                and follow every delivery from checkout to your door.
              </p>

              <form onSubmit={handleSearch} className="mt-8 flex w-full max-w-lg items-center gap-2 rounded-2xl border border-border bg-surface p-1.5 shadow-soft">
                <div className="relative flex-1">
                  <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="What are you looking for?"
                    aria-label="Search products"
                    className="h-11 w-full rounded-xl bg-transparent pl-10 pr-3 text-sm text-text outline-none placeholder:text-text-muted"
                  />
                </div>
                <Button type="submit" className="shrink-0">
                  Search
                </Button>
              </form>

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck size={15} className="text-brand" /> {products.length > 0 ? `${products.length} live listings` : "Curated listings"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Store size={15} className="text-brand" /> {liveCategoryCount > 0 ? `${liveCategoryCount} categories` : "Everyday essentials"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-brand" /> Buyer protection
                </span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="relative hidden lg:block"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4 pt-8">
                  <div className="overflow-hidden rounded-[1.5rem] border border-border bg-surface shadow-soft">
                    <img src="/slides/hero-1.jpg" alt="Marketplace sourcing" className="h-56 w-full object-cover" />
                  </div>
                  <div className="overflow-hidden rounded-[1.5rem] border border-border bg-surface shadow-soft">
                    <img src="/slides/hero-3.jpg" alt="Product discovery" className="h-40 w-full object-cover" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-[1.5rem] border border-border bg-surface shadow-soft">
                    <img src="/slides/hero-2.jpg" alt="Trusted sellers" className="h-40 w-full object-cover" />
                  </div>
                  <div className="overflow-hidden rounded-[1.5rem] border border-border bg-surface shadow-soft">
                    <img src="/slides/hero-4.jpg" alt="Local inventory" className="h-56 w-full object-cover" />
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-4 left-6 right-6 flex items-center justify-between rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-lift backdrop-blur">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-light text-accent-strong">
                    <Truck size={17} />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-text">Live delivery tracking</p>
                    <p className="text-[11px] text-text-muted">Follow every order in real time</p>
                  </div>
                </div>
                <CheckCircle2 size={18} className="text-success" />
              </div>
            </motion.div>
          </div>
        </section>

        {/* ---------------- Value props ---------------- */}
        <section className="mx-auto grid max-w-7xl gap-4 px-4 py-10 sm:grid-cols-3 sm:px-6 lg:px-8">
          {VALUE_PROPS.map((item) => (
            <div key={item.title} className="flex gap-3.5 rounded-2xl border border-border bg-surface p-4 shadow-soft">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
                <item.icon size={19} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-text">{item.title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{item.copy}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ---------------- Products ---------------- */}
        <section id="products" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="eyebrow">Marketplace</span>
              <h2 className="section-title mt-2">Fresh from verified sellers</h2>
              <p className="mt-1 text-sm text-text-muted">
                {loading ? "Loading live listings…" : `${filteredItems.length} products ready to order`}
              </p>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {categories.slice(0, 6).map((category) => (
                <button
                  key={category}
                  onClick={() => handleCategory(category)}
                  className={`chip ${activeCategory === category ? "chip-active" : ""}`}
                >
                  {category === "all" ? "All products" : category}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
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
          ) : displayedItems.length === 0 ? (
            <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-soft/50 px-6 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-text-muted shadow-soft">
                <Search size={26} />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-text">No products match your search</h3>
              <p className="mt-1 max-w-sm text-sm text-text-muted">
                Try a different keyword or category, or send us a sourcing request and we will look for it.
              </p>
              <div className="mt-5 flex gap-2">
                <Button variant="secondary" onClick={() => { setSearch(""); setActiveCategory("all"); }}>
                  Clear filters
                </Button>
                <a href="#sourcing" className="btn-primary">
                  Request sourcing
                </a>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
                {displayedItems.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onOpen={() => navigate(`/product/${product.id}`)}
                    onAdd={() => {
                      addToCart({
                        id: product.id,
                        name: product.name || "Product",
                        price: product.price || 0,
                        image_url: product.image_url,
                        seller_id: product.seller_id,
                        seller_name: product.seller_name || null,
                      });
                      setIsOpen(true);
                    }}
                  />
                ))}
              </div>

              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                {filteredItems.length > displayCount ? (
                  <Button variant="secondary" onClick={() => setDisplayCount((count) => count + 8)}>
                    Show more products
                    <ChevronRight size={15} />
                  </Button>
                ) : null}
                <Link to={token ? "/app/products" : "/register/customer"} className="btn-ghost">
                  {token ? "Open full catalogue" : "Create an account to order"}
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            </>
          )}
        </section>

        {/* ---------------- How it works ---------------- */}
        <section id="how-it-works" className="scroll-mt-20 border-y border-border bg-surface">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <span className="eyebrow">How it works</span>
              <h2 className="section-title mt-2">From discovery to delivery in three steps</h2>
              <p className="mt-2 text-sm text-text-muted">
                A simple, transparent buying experience built for both everyday shoppers and growing businesses.
              </p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <div key={step.title} className="relative rounded-2xl border border-border bg-bg p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
                      <step.icon size={18} />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Step {index + 1}</span>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold text-text">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-text-muted">{step.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Seller CTA ---------------- */}
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid items-center gap-8 overflow-hidden rounded-[1.75rem] border border-border bg-dark-bg p-8 text-white sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:p-12">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80">
                <Store size={13} /> For sellers
              </span>
              <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
                Put your products in front of ready buyers.
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/70">
                Open a storefront, manage inventory, respond to sourcing requests, and reach customers
                across the region — all from one workspace.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/register/business" className="btn-primary !bg-white !text-slate-900 hover:!bg-white/90">
                  Start selling
                  <ArrowRight size={15} />
                </Link>
                <Link to="/login" className="btn !border-white/20 !bg-white/5 !text-white hover:!bg-white/10">
                  Seller sign in
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/60">
                <span className="inline-flex items-center gap-1.5"><BadgeCheck size={14} /> Verified badges</span>
                <span className="inline-flex items-center gap-1.5"><Globe2 size={14} /> Wider reach</span>
                <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} /> Secure payouts</span>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <img src="/slides/hero-2.jpg" alt="Seller storefront" className="h-56 w-full object-cover sm:h-64" />
            </div>
          </div>
        </section>

        {/* ---------------- Sourcing ---------------- */}
        <section id="sourcing" className="scroll-mt-20 border-t border-border bg-surface">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <span className="eyebrow">Sourcing request</span>
              <h2 className="section-title mt-2">Can&apos;t find what you need?</h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-text-muted">
                Tell us what you are looking for and our network of verified sellers will help source it.
                Perfect for bulk orders, special items, and business supplies.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Share your requirement and target budget",
                  "Verified sellers respond with options",
                  "Compare and order once you are happy",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 text-sm text-text-muted">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-bg p-5 shadow-soft sm:p-6">
              {rfqStatus ? (
                <div
                  className={`mb-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium ${
                    rfqStatus.tone === "success"
                      ? "border-success/25 bg-success/10 text-success"
                      : "border-danger/25 bg-danger/10 text-danger"
                  }`}
                >
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                  {rfqStatus.message}
                </div>
              ) : null}

              <form onSubmit={submitRfq} className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Business name"
                  value={rfqDraft.company_name}
                  onChange={(e) => setRfqDraft((p) => ({ ...p, company_name: e.target.value }))}
                  placeholder="Your business"
                  required
                />
                <Input
                  label="Contact name"
                  value={rfqDraft.contact_name}
                  onChange={(e) => setRfqDraft((p) => ({ ...p, contact_name: e.target.value }))}
                  placeholder="Your name"
                  required
                />
                <Input
                  label="Email"
                  type="email"
                  value={rfqDraft.email}
                  onChange={(e) => setRfqDraft((p) => ({ ...p, email: e.target.value }))}
                  placeholder="you@example.com"
                  required
                />
                <Input
                  label="Phone (optional)"
                  value={rfqDraft.phone}
                  onChange={(e) => setRfqDraft((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+255…"
                />
                <Input
                  label="What do you need?"
                  value={rfqDraft.product_interest}
                  onChange={(e) => setRfqDraft((p) => ({ ...p, product_interest: e.target.value }))}
                  placeholder="Product or category"
                  required
                  className="sm:col-span-2"
                />
                <Input
                  label="Quantity"
                  type="number"
                  min={1}
                  value={rfqDraft.quantity}
                  onChange={(e) => setRfqDraft((p) => ({ ...p, quantity: e.target.value }))}
                />
                <Input
                  label="Target budget (optional)"
                  value={rfqDraft.target_budget}
                  onChange={(e) => setRfqDraft((p) => ({ ...p, target_budget: e.target.value }))}
                  placeholder="e.g. TZS 500,000"
                />
                <Textarea
                  label="Notes (optional)"
                  rows={3}
                  value={rfqDraft.notes}
                  onChange={(e) => setRfqDraft((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Specifications, delivery location, timeline…"
                  className="sm:col-span-2"
                />
                <Button type="submit" loading={submittingRfq} className="sm:col-span-2">
                  Send sourcing request
                  <ArrowRight size={15} />
                </Button>
              </form>
            </div>
          </div>
        </section>
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t border-border bg-dark-bg text-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand p-1.5">
                  <img src={logoUrl} alt="Soko-Link" className="h-full w-full object-contain" />
                </span>
                <span className="font-display text-lg font-bold tracking-tight">Soko-Link</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
                A modern marketplace connecting customers, trusted sellers, and reliable delivery partners
                across the region.
              </p>
              <div className="mt-5 space-y-2 text-xs text-white/60">
                <p className="flex items-center gap-2"><Mail size={14} className="text-brand" /> support@sokolink.net</p>
                <p className="flex items-center gap-2"><MapPin size={14} className="text-brand" /> Soko-Link Hub, Dar es Salaam</p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-white/40">Marketplace</h4>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li><a href="#products" className="text-white/60 transition-colors hover:text-white">Browse products</a></li>
                <li><a href="#how-it-works" className="text-white/60 transition-colors hover:text-white">How it works</a></li>
                <li><a href="#sourcing" className="text-white/60 transition-colors hover:text-white">Request sourcing</a></li>
                <li><Link to={token ? "/app/orders" : "/login"} className="text-white/60 transition-colors hover:text-white">Track an order</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-white/40">Get started</h4>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li><Link to="/register/customer" className="text-white/60 transition-colors hover:text-white">Create a buyer account</Link></li>
                <li><Link to="/register/business" className="text-white/60 transition-colors hover:text-white">Open a seller storefront</Link></li>
                <li><Link to="/register/logistics" className="text-white/60 transition-colors hover:text-white">Join as a delivery partner</Link></li>
                <li><Link to="/login" className="text-white/60 transition-colors hover:text-white">Sign in</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row">
            <p>© {new Date().getFullYear()} Soko-Link. All rights reserved.</p>
            <p className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1"><ShieldCheck size={13} /> Secure marketplace</span>
              <span className="mx-1.5 text-white/20">·</span>
              <span className="inline-flex items-center gap-1"><Truck size={13} /> Tracked delivery</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
