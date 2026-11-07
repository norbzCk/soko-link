import { Link } from "react-router-dom";
import logoUrl from "../assets/sokolink-logo.png";

export function BrandMark({ to = "/", subtitle = "Smart marketplace operations" }: { to?: string; subtitle?: string }) {
  return (
    <Link to={to} className="group flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand p-1.5 shadow-sm transition-transform duration-300 group-hover:-rotate-3">
        <img className="h-full w-full object-contain" src={logoUrl} alt="Soko-Link" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-display text-base font-bold leading-tight tracking-tight text-text">Soko-Link</span>
        {subtitle ? (
          <span className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">{subtitle}</span>
        ) : null}
      </span>
    </Link>
  );
}
