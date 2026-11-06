import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs?: number;
}

export interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, durationMs?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function ToastItem({ item, onDismiss }: { item: Toast; onDismiss: (id: string) => void }) {
  const duration = item.durationMs ?? 4000;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(item.id), duration);
    return () => clearTimeout(timer);
  }, [item.id, duration, onDismiss]);

  const configs: Record<ToastVariant, { icon: typeof CheckCircle2; className: string }> = {
    success: { icon: CheckCircle2, className: "bg-emerald-600 text-white border-emerald-700" },
    error: { icon: XCircle, className: "bg-rose-600 text-white border-rose-700" },
    warning: { icon: AlertTriangle, className: "bg-amber-600 text-white border-amber-700" },
    info: { icon: Info, className: "bg-blue-600 text-white border-blue-700" },
  };

  const { icon: Icon, className } = configs[item.variant] || configs.info;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border min-w-[280px] max-w-[420px] text-xs font-bold ${className}`}
    >
      <Icon size={18} className="shrink-0" />
      <span className="flex-1 leading-snug">{item.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="shrink-0 opacity-75 hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-white/10"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = "info", durationMs?: number) => {
    const id = `toast-${++counter.current}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, variant, durationMs }]);
  }, []);

  const success = useCallback((message: string) => toast(message, "success"), [toast]);
  const error = useCallback((message: string) => toast(message, "error"), [toast]);
  const warning = useCallback((message: string) => toast(message, "warning"), [toast]);
  const info = useCallback((message: string) => toast(message, "info"), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      <div className="fixed top-5 right-5 z-[200] flex flex-col gap-2.5 items-end pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((item) => (
            <div key={item.id} className="pointer-events-auto">
              <ToastItem item={item} onDismiss={dismiss} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
