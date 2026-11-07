import type { MouseEvent } from "react";
import { AlertTriangle, Edit2, Plus, RotateCcw, Store, Trash2 } from "lucide-react";
import type { Product } from "../../types/domain";
import { formatMoney, resolveImageUrl } from "../../lib/format";

export function ProductCard({
  product,
  onOpen,
  onAdd,
  canManage = false,
  onEdit,
  onDelete,
  onReactivate,
}: {
  product: Product;
  onOpen: () => void;
  onAdd?: () => void;
  canManage?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onReactivate?: () => void;
}) {
  const outOfStock = !(typeof product.stock === "number" && product.stock > 0);
  const lowStock = typeof product.stock === "number" && product.stock > 0 && product.stock <= 5;
  const isInactive = product.is_active === false;

  function stop(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <article
      onClick={onOpen}
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[1.25rem] border border-border bg-surface shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-lift"
    >
      <div className="relative aspect-square overflow-hidden bg-surface-soft">
        <img
          src={resolveImageUrl(product.image_url)}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-lg bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700 shadow-sm backdrop-blur">
            {product.category || "General"}
          </span>
          {isInactive ? (
            <span className="rounded-lg bg-slate-800/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">
              Hidden
            </span>
          ) : null}
          {lowStock ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-danger px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
              <AlertTriangle size={11} /> Low
            </span>
          ) : null}
        </div>

        {canManage ? (
          <div className="absolute right-3 top-3 flex translate-y-1 gap-1.5 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
            {onEdit ? (
              <button
                type="button"
                onClick={(e) => {
                  stop(e);
                  onEdit();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-slate-700 shadow-sm backdrop-blur transition-colors hover:bg-brand hover:text-white"
                title="Edit product"
              >
                <Edit2 size={14} />
              </button>
            ) : null}
            {isInactive && onReactivate ? (
              <button
                type="button"
                onClick={(e) => {
                  stop(e);
                  onReactivate();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-emerald-600 shadow-sm backdrop-blur transition-colors hover:bg-emerald-600 hover:text-white"
                title="Restore product"
              >
                <RotateCcw size={14} />
              </button>
            ) : onDelete ? (
              <button
                type="button"
                onClick={(e) => {
                  stop(e);
                  onDelete();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 text-danger shadow-sm backdrop-blur transition-colors hover:bg-danger hover:text-white"
                title="Delete product"
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
          <Store size={12} className="shrink-0" />
          <span className="truncate">{product.seller_name || product.seller?.business_name || "Independent seller"}</span>
        </div>

        <h3 className="line-clamp-2 font-display text-[0.95rem] font-semibold leading-snug text-text transition-colors group-hover:text-brand">
          {product.name}
        </h3>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-text-muted">Price</span>
            <span className="block truncate font-display text-lg font-bold tracking-tight text-text">
              {formatMoney(product.price)}
            </span>
          </div>

          {onAdd ? (
            <button
              type="button"
              disabled={outOfStock}
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-sm transition-all hover:bg-brand-strong active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
              title={outOfStock ? "Out of stock" : "Add to cart"}
              aria-label={outOfStock ? "Out of stock" : `Add ${product.name} to cart`}
            >
              <Plus size={17} />
            </button>
          ) : (
            <span className={`text-xs font-semibold ${outOfStock ? "text-danger" : "text-success"}`}>
              {outOfStock ? "Out of stock" : "In stock"}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
