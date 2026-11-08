import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, CheckCircle2, MailCheck, RotateCcw } from "lucide-react";
import { AuthScene } from "../components/AuthScene";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Field";
import { useAuth } from "../features/auth/AuthContext";

const ROLE_MESSAGES: Record<string, string> = {
  seller:
    "We sent a 6-digit code to your inbox. Verify your email, then wait for administrator approval before signing in.",
  logistics:
    "We sent a 6-digit code to your inbox. Verify your email, then wait for administrator approval before signing in.",
  customer: "We sent a 6-digit code to your inbox. Enter it below to activate your account.",
};

export function VerifyOtpPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { verifyEmailOtp, resendRegistrationOtp } = useAuth();
  const registeredAs = searchParams.get("registered") || "customer";
  const initialEmail = (searchParams.get("email") || "").trim().toLowerCase();
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"" | "verify" | "resend">("");
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter the email address you registered with.");
      return;
    }
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy("verify");
    setError("");
    setMessage("");
    try {
      await verifyEmailOtp(normalizedEmail, otp.trim());
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify that code.");
    } finally {
      setBusy("");
    }
  }

  async function handleResend() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter the email address you registered with.");
      return;
    }
    setBusy("resend");
    setError("");
    setMessage("");
    try {
      await resendRegistrationOtp(normalizedEmail);
      setCooldown(30);
      setMessage("If the account needs verification, a new code and link have been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend the verification code.");
    } finally {
      setBusy("");
    }
  }

  function continueToLogin() {
    const params = new URLSearchParams({ verified: "1", registered: registeredAs });
    navigate(`/login?${params.toString()}`, { replace: true });
  }

  return (
    <AuthScene
      eyebrow="Email verification"
      title="One quick check keeps your marketplace account secure."
      description="Confirm the email on your Soko-Link account with a short-lived code from your inbox."
      bullets={[
        "Codes expire after 10 minutes",
        "Only one active code at a time",
        "Your account activates after verification",
      ]}
      links={[
        { to: "/login", label: "Back to sign in" },
        { to: "/register/customer", label: "Create account" },
      ]}
    >
      <div className="space-y-5">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-text">
            {verified ? "Email verified" : "Verify your email"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-text-muted">
            {verified
              ? "Your email address is confirmed. Sign in to continue."
              : ROLE_MESSAGES[registeredAs] || ROLE_MESSAGES.customer}
          </p>
        </div>

        {message ? (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-success/25 bg-success/10 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-success"
          >
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            {message}
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-danger"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : null}

        {verified ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/10 p-4 text-sm text-success">
              <MailCheck size={20} className="mt-0.5 shrink-0" />
              <p className="font-medium leading-relaxed">
                You can sign in now.
                {registeredAs === "seller" || registeredAs === "logistics"
                  ? " Your application still needs administrator approval before you can access the dashboard."
                  : ""}
              </p>
            </div>
            <Button type="button" fullWidth iconRight={<ArrowRight size={16} />} onClick={continueToLogin}>
              Continue to sign in
            </Button>
          </div>
        ) : (
          <form className="space-y-3.5" onSubmit={handleSubmit}>
            <Input
              label="Email address"
              name="email"
              type="email"
              placeholder="john@example.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <label className="field">
              <span className="field-label">6-digit code</span>
              <input
                name="otp"
                className="field-input text-center font-display text-xl font-semibold tracking-[0.45em]"
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
              <span className="field-hint">Check your inbox and spam folder. The code expires in 10 minutes.</span>
            </label>

            <Button type="submit" fullWidth loading={busy === "verify"} iconRight={<ArrowRight size={16} />}>
              {busy === "verify" ? "Verifying…" : "Verify email"}
            </Button>

            <div className="rounded-xl border border-border bg-surface-soft/60 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-text-muted">Didn't get the code?</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={busy === "resend"}
                  disabled={cooldown > 0}
                  icon={<RotateCcw size={14} />}
                  onClick={handleResend}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </Button>
              </div>
            </div>
          </form>
        )}

        <p className="text-center text-xs text-text-muted">
          Wrong email or need a fresh link?{" "}
          <Link to="/verify-email" className="font-semibold text-brand hover:underline">
            Use the verification page
          </Link>
        </p>
      </div>
    </AuthScene>
  );
}
