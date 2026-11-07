import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, ImagePlus } from "lucide-react";
import { AuthScene } from "../components/AuthScene";
import { apiRequest } from "../lib/http";
import { Input, Select, Textarea } from "../components/ui/Field";
import { Button } from "../components/ui/Button";

export function BusinessRegisterPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setLogoFile(file);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    for (const key of ["business_name", "owner_name", "email", "phone", "area", "street", "shop_number", "operating_hours", "description"]) {
      const value = form.get(key);
      if (typeof value === "string") form.set(key, value.trim());
    }
    form.set("email", String(form.get("email") || "").toLowerCase());

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

    try {
      await apiRequest("/business/register", {
        method: "POST",
        body: form,
        auth: false,
      });
      navigate("/login?registered=seller", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setIsSubmitting(false);
    }
  }

  return (
    <AuthScene
      eyebrow="Business onboarding"
      title="Open your storefront on Soko-Link."
      description="Set up your seller profile, list products, and manage orders from a single workspace."
      bullets={[
        "Create a seller-ready account in one step",
        "Build trust with verification badges",
        "Access marketplace analytics",
      ]}
      links={[
        { to: "/login", label: "Back to sign in" },
        { to: "/register/customer", label: "Join as customer" },
      ]}
    >
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-text">Business registration</h2>
          <p className="mt-1 text-sm text-text-muted">Tell us about your business.</p>
        </div>

        {error ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5 text-xs font-medium text-danger">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        ) : null}

        <form className="space-y-3.5" onSubmit={handleSubmit}>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Input label="Business name" name="business_name" placeholder="Soko Retailers" required />
            <Input label="Owner name" name="owner_name" placeholder="Full name" required />
            <Input label="Email" name="email" type="email" placeholder="business@example.com" autoComplete="email" required />
            <Input label="Phone" name="phone" type="tel" placeholder="0712 345 678" autoComplete="tel" required />
            <Select label="Business type" name="business_type" defaultValue="individual">
              <option value="individual">Individual trader</option>
              <option value="company">Registered company</option>
            </Select>
            <Input label="Category" name="category" placeholder="Electronics" />
            <Input label="Region" name="region" defaultValue="Dar es Salaam" />
            <Input label="Area" name="area" placeholder="Kariakoo" />
            <Input label="Street address" name="street" placeholder="Street" />
            <Input label="Shop number" name="shop_number" placeholder="Shop no." />
          </div>

          <div className="grid gap-3.5 sm:grid-cols-[1fr_auto] sm:items-end">
            <Input label="Operating hours" name="operating_hours" placeholder="Mon–Sat, 08:00–18:00" />
            <div className="field">
              <span className="field-label">Shop logo</span>
              <div className="flex items-center gap-2.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-soft">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
                  ) : (
                    <ImagePlus size={18} className="text-text-muted" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="max-w-[9rem] truncate rounded-xl border border-dashed border-border bg-surface-soft px-3 py-2.5 text-left text-xs font-medium text-text-muted transition-colors hover:border-brand/40 hover:text-text"
                >
                  {logoFile ? logoFile.name : "Choose image"}
                </button>
                <input
                  ref={fileInputRef}
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleLogoChange}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          <Textarea
            label="Business description"
            name="description"
            rows={2}
            placeholder="What do you sell? Where do you operate?"
          />

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
            <span>I agree to the seller terms, privacy policy, email verification, and administrator approval of my application.</span>
          </label>

          <Button type="submit" fullWidth loading={isSubmitting} iconRight={<ArrowRight size={16} />}>
            {isSubmitting ? "Submitting application…" : "Create business account"}
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
