import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { AuthScene } from "../components/AuthScene";
import { useAuth } from "../features/auth/AuthContext";
import { getPostLoginPath } from "../features/auth/authStorage";
import { Field, Input } from "../components/ui/Field";
import { Button } from "../components/ui/Button";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const registeredAs = searchParams.get("registered");
  const verifyFirst = searchParams.get("verify") === "1";
  const justVerified = searchParams.get("verified") === "1";
  const welcomeMessages: Record<string, string> = {
    seller: "Your business account was created. Check your email for a 6-digit code, then wait for administrator approval before signing in.",
    customer: "Your account was created. Check your email for a 6-digit code to activate it.",
    logistics: "Your logistics account was created. Check your email for a 6-digit code, then wait for administrator approval before signing in.",
  };
  const { login } = useAuth();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const identifier = String(form.get("identifier") || "").trim();
    const password = String(form.get("password") || "");

    try {
      const user = await login(identifier, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from || getPostLoginPath(user));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthScene
      eyebrow="Welcome back"
      title="Sign in and keep your business moving."
      description="Manage your listings, orders, payments, and deliveries from one calm, focused workspace."
      bullets={[
        "One account for buying and selling",
        "Live order and delivery tracking",
        "Secure, role-based access",
      ]}
      links={[
        { to: "/register/customer", label: "Create account" },
        { to: "/forgot-password", label: "Recover access" },
        { to: "/superadmin", label: "Admin portal" },
      ]}
    >
      <div className="space-y-5">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-text">Sign in</h2>
          <p className="mt-1 text-sm text-text-muted">Welcome back to Soko-Link.</p>
        </div>

        {justVerified ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-success/25 bg-success/10 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-success">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>
              Email verified. Sign in to continue.
              {registeredAs === "seller" || registeredAs === "logistics"
                ? " Your application still needs administrator approval before dashboard access."
                : ""}
            </span>
          </div>
        ) : registeredAs && welcomeMessages[registeredAs] ? (
          <div
            className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium leading-relaxed ${
              verifyFirst
                ? "border-accent/25 bg-accent/10 text-[color:var(--accent-strong)]"
                : "border-success/25 bg-success/10 text-success"
            }`}
          >
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>
              {verifyFirst ? "One more step. " : "Welcome to Soko-Link! "}
              {welcomeMessages[registeredAs]}{" "}
              <Link to="/verify-otp" className="underline underline-offset-2">Enter verification code</Link>{" "}
              or{" "}
              <Link to="/verify-email" className="underline underline-offset-2">resend verification email</Link>.
            </span>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-xs font-medium text-danger">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : null}

        <form className="space-y-3.5" onSubmit={handleLogin}>
          <Input
            label="Email or phone"
            name="identifier"
            placeholder="name@example.com or +255…"
            autoComplete="username"
            required
          />

          <Field label={<span className="flex w-full items-center justify-between">Password <Link to="/forgot-password" className="text-[11px] font-semibold normal-case tracking-normal text-brand hover:underline">Forgot?</Link></span>}>
            <div className="relative">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                className="field-input pr-11"
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-soft hover:text-brand"
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          <Button type="submit" fullWidth loading={isSubmitting} iconRight={<ArrowRight size={16} />} className="!mt-5">
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="text-center text-xs text-text-muted">
          New to Soko-Link?{" "}
          <Link to="/register/customer" className="font-semibold text-brand hover:underline">Create an account</Link>
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border pt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          <Link to="/register/business" className="transition-colors hover:text-brand">Sell on Soko-Link</Link>
          <Link to="/register/logistics" className="transition-colors hover:text-brand">Deliver with us</Link>
          <Link to="/" className="transition-colors hover:text-brand">Marketplace</Link>
        </div>
      </div>
    </AuthScene>
  );
}
