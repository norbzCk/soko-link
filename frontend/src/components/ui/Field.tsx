import { forwardRef, useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type BaseFieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
};

export function Field({
  label,
  hint,
  error,
  className = "",
  children,
}: BaseFieldProps & { children: ReactNode }) {
  return (
    <div className={`field ${className}`}>
      {label ? <span className="field-label">{label}</span> : null}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & BaseFieldProps
>(function Input({ label, hint, error, className = "", id, ...props }, ref) {
  const autoId = useId();
  const fieldId = id || autoId;
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <input ref={ref} id={fieldId} className={`field-input ${error ? "!border-danger" : ""}`} {...props} />
    </Field>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & BaseFieldProps
>(function Textarea({ label, hint, error, className = "", id, ...props }, ref) {
  const autoId = useId();
  const fieldId = id || autoId;
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <textarea ref={ref} id={fieldId} className={`field-textarea ${error ? "!border-danger" : ""}`} {...props} />
    </Field>
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & BaseFieldProps
>(function Select({ label, hint, error, className = "", id, children, ...props }, ref) {
  const autoId = useId();
  const fieldId = id || autoId;
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <select ref={ref} id={fieldId} className={`field-select ${error ? "!border-danger" : ""}`} {...props}>
        {children}
      </select>
    </Field>
  );
});
