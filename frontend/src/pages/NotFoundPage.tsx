import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Store, Compass } from "lucide-react";

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="text-center max-w-md w-full"
      >
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-brand/10 text-brand border border-brand/20 mb-8 shadow-inner">
          <Compass size={44} className="animate-spin-slow" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-brand block mb-2">404 Error</span>
        <h1 className="text-4xl sm:text-5xl font-display font-black text-text tracking-tight mb-3">Page Not Found</h1>
        <p className="text-sm font-medium text-text-muted mb-8 leading-relaxed">
          The requested page could not be located in the Soko-Link catalog or workspace. It may have moved or been updated.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="btn-primary flex items-center justify-center gap-2 shadow-lg shadow-brand/20"
          >
            <ArrowLeft size={16} />
            Return to Marketplace
          </Link>
          <Link
            to="/login"
            className="btn-secondary flex items-center justify-center gap-2"
          >
            <Store size={16} />
            Sign In
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
