import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight } from "lucide-react";
import { AuthScene } from "../components/AuthScene";
import { apiRequest } from "../lib/http";
import { Input } from "../components/ui/Field";
import { Button } from "../components/ui/Button";

export function CustomerRegisterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmPassword = String(form.get("confirm_password") || "");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setIsSubmitting(false);
      return;
    }
    if (!form.get("terms")) {
      setError("Please accept the terms and privacy policy.");
      setIsSubmitting(false);
      return;
    }
    const payload = {
      name: String(form.get("name") || "").trim(),
      email: String(form.get("email") || "").trim().toLowerCase(),
      phone: String(form.get("phone") || "").trim(),
      password,
    };

    try {
      await apiRequest("/auth/register", {
        method: "POST",
        body: payload,
        auth: false,
      });
      navigate(`/verify-otp?${new URLSearchParams({ email: payload.email, registered: "customer" }).toString()}`, {
        replace: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setIsSubmitting(false);
    }
  }

  return (
    <AuthScene
      eyebrow="Customer onboarding"
      title="Create your buyer account and start sourcing."
      description="Join the marketplace, compare suppliers, and track orders inside your customer workspace."
      bullets={[
        "Browse verified products and suppliers",
        "Submit RFQs and place orders faster",
        "Track payments and delivery progress",
      ]}
      links={[
        { to: "/login", label: "Back to sign in" },
        { to: "/register/business", label: "Need a seller account?" },
      ]}
    >
      <div className="space-y-5">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-text">Create your account</h2>
          <p className="mt-1 text-sm text-text-muted">It only takes a minute.</p>
        </div>

        {error ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-xs font-medium text-danger">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : null}

        <form className="space-y-3.5" onSubmit={handleSubmit}>
          <Input label="Full name" name="name" placeholder="John Doe" autoComplete="name" required />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Input label="Email" name="email" type="email" placeholder="john@example.com" autoComplete="email" required />
            <Input label="Phone" name="phone" type="tel" placeholder="0712 345 678" autoComplete="tel" required />
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Input
              label="Password"
              name="password"
              type="password"
              minLength={8}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              required
            />
            <Input
              label="Confirm password"
              name="confirm_password"
              type="password"
              minLength={8}
              placeholder="Repeat password"
              autoComplete="new-password"
              required
            />
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-soft/60 p-3 text-xs font-medium leading-relaxed text-text-muted">
            <input name="terms" type="checkbox" className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--brand)]" required />
            <span>I agree to the marketplace terms, privacy policy, and email verification process.</span>
          </label>

          <Button type="submit" fullWidth loading={isSubmitting} iconRight={<ArrowRight size={16} />}>
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="text-center text-xs text-text-muted">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
        </p>
      </div>
    </AuthScene>
  );
}
