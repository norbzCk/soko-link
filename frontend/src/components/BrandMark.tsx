import { Link } from "react-router-dom";
import logoUrl from "../assets/sokolink-logo.png";

export function BrandMark({ to = "/", subtitle = "Smart marketplace operations" }: { to?: string; subtitle?: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 transition-all duration-300 hover:scale-105 hover:gap-4 group">
      <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center p-1.5 shadow-lg group-hover:shadow-xl group-hover:shadow-brand/20 transition-all duration-300 group-hover:rotate-12">
        <img className="w-full h-full object-contain rounded-full" src={logoUrl} alt="SokoLnk" />
      </div>
      <div className="flex flex-col">
        <span className="font-display font-extrabold text-lg tracking-tight leading-tight text-slate-900 dark:text-white group-hover:text-brand transition-colors duration-300">SokoLnk</span>
        {subtitle ? <span className="text-[10px] uppercase tracking-widest font-bold text-brand group-hover:text-brand-strong transition-colors duration-300">{subtitle}</span> : null}
      </div>
    </Link>
  );
}
