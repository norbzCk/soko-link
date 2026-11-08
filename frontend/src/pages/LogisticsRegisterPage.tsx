import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, ImagePlus } from "lucide-react";
import { AuthScene } from "../components/AuthScene";
import { apiRequest } from "../lib/http";
import { Input, Select } from "../components/ui/Field";
import { Button } from "../components/ui/Button";

export function LogisticsRegisterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    for (const key of ["name", "phone", "vehicle_type", "plate_number", "license_number", "base_area", "coverage_areas"]) {
      const value = form.get(key);
      if (typeof value === "string") form.set(key, value.trim());
    }
    form.set("email", String(form.get("email") || "").trim().toLowerCase());

    const password = String(form.get("password") || "");
    if (password !== String(form.get("confirm_password") || "")) {
      setError("Passwords do not match.");
      setIsSubmitting(false);
      return;
    }
    if (!form.get("terms")) {
      setError("Please accept the terms and privacy policy.");
      setIsSubmitting(false);
      return;
    }
    form.delete("confirm_password");
    form.delete("terms");
    const email = String(form.get("email") || "");

    try {
      await apiRequest("/logistics/register", {
        method: "POST",
        body: form,
        auth: false,
      });
      navigate(`/verify-otp?${new URLSearchParams({ email, registered: "logistics" }).toString()}`, {
        replace: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setIsSubmitting(false);
    }
  }

  return (
    <AuthScene
      eyebrow="Logistics onboarding"
      title="Join the delivery network."
      description="Register a rider or delivery company, manage availability, and update order statuses as you go."
      bullets={[
        "Go online and manage availability",
        "Accept and track assigned deliveries",
        "Work with sellers across the marketplace",
      ]}
      links={[
        { to: "/login", label: "Back to sign in" },
        { to: "/register/customer", label: "Join as customer" },
      ]}
    >
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-text">Logistics registration</h2>
          <p className="mt-1 text-sm text-text-muted">Register as a rider or delivery company.</p>
        </div>

        {error ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-xs font-medium text-danger">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : null}

        <form className="space-y-3.5" onSubmit={handleSubmit}>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Input label="Full name" name="name" placeholder="Your name" autoComplete="name" required />
            <Input label="Phone" name="phone" type="tel" placeholder="0712 345 678" autoComplete="tel" required />
            <Input label="Email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
            <Select label="Account type" name="account_type" defaultValue="individual">
              <option value="individual">Individual rider</option>
              <option value="company">Registered company</option>
            </Select>
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
            <Input label="Vehicle type" name="vehicle_type" placeholder="Motorcycle, van, truck…" />
            <Input label="Plate number" name="plate_number" placeholder="T 123 ABC" />
            <Input label="License number" name="license_number" placeholder="Driving licence no." />
            <Input label="Base area" name="base_area" placeholder="Kariakoo, Sinza…" />
          </div>

          <Input label="Coverage areas" name="coverage_areas" placeholder="Comma separated, e.g. Sinza, Magomeni" />

          <div className="field">
            <span className="field-label">Profile photo (optional)</span>
            <div className="flex items-center gap-2.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-soft">
                {photoPreview ? (
                  <img src={photoPreview} alt="Profile preview" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus size={18} className="text-text-muted" />
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border border-dashed border-border bg-surface-soft px-3 py-2.5 text-xs font-medium text-text-muted transition-colors hover:border-brand/40 hover:text-text"
              >
                {photoFile ? photoFile.name : "Choose image"}
              </button>
              <input
                ref={fileInputRef}
                name="profile_photo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </div>
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-soft/60 p-3 text-xs font-medium leading-relaxed text-text-muted">
            <input name="terms" type="checkbox" className="mt-0.5 h-4 w-4 rounded border-border accent-[var(--brand)]" required />
            <span>I agree to the logistics partner terms, privacy policy, email verification, and administrator approval of my application.</span>
          </label>

          <Button type="submit" fullWidth loading={isSubmitting} iconRight={<ArrowRight size={16} />}>
            {isSubmitting ? "Submitting application…" : "Create logistics account"}
          </Button>
        </form>

        <p className="text-center text-xs text-text-muted">
          Already registered?{" "}
          <Link to="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
        </p>
      </div>
    </AuthScene>
  );
}
