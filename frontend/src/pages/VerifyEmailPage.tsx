import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { PageSection } from "../components/ui/PageSections";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { verifyEmail, resendConfirmationEmail, sendPhoneOtp, verifyPhoneOtp } = useAuth();
  const token = searchParams.get("token");
  const [message, setMessage] = useState(token ? "Verifying your email..." : "");
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setMessage("Verifying your email...");
    verifyEmail(token)
      .then(() => {
        if (cancelled) return;
        setMessage("Email verified successfully. You can now sign in.");
        setIsSuccess(true);
        window.setTimeout(() => navigate("/login", { replace: true }), 2500);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Email verification failed.");
        setMessage("");
      });
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("resend");
    setError("");
    setMessage("");
    try {
      await resendConfirmationEmail(email);
      setMessage("If the account needs verification, a new email has been sent. Check your inbox and spam folder.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend verification email.");
    } finally {
      setBusy("");
    }
  }

  async function handleSendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("otp-send");
    setError("");
    setMessage("");
    try {
      await sendPhoneOtp(phone);
      setMessage("If the number belongs to an account, a verification code has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send verification code.");
    } finally {
      setBusy("");
    }
  }

  async function handleVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("otp-verify");
    setError("");
    setMessage("");
    try {
      await verifyPhoneOtp(phone, otp);
      setMessage("Phone number verified successfully.");
      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to verify phone number.");
    } finally {
      setBusy("");
    }
  }

  return (
    <PageSection title={isSuccess ? "Verification successful" : "Verify your account"}>
      {message ? <p className="alert success">{message}</p> : null}
      {error ? <p className="alert error">{error}</p> : null}
      {token ? (
        isSuccess ? <p>Redirecting to sign in...</p> : null
      ) : (
        <div className="space-y-8">
          <form className="form-grid auth-form-grid" onSubmit={handleResend}>
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@email.com"
                required
              />
            </label>
            <button className="primary-button auth-submit" type="submit" disabled={busy === "resend"}>
              {busy === "resend" ? "Sending..." : "Resend verification email"}
            </button>
          </form>

          <div className="space-y-4 border-t border-border pt-6">
            <p className="text-sm font-bold text-text-muted">Verify your phone number instead</p>
            <form className="form-grid auth-form-grid" onSubmit={handleSendOtp}>
              <label>
                Phone number
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="0712345678"
                  required
                />
              </label>
              <button className="secondary-button auth-submit" type="submit" disabled={busy === "otp-send"}>
                {busy === "otp-send" ? "Sending..." : "Send code"}
              </button>
            </form>
            <form className="form-grid auth-form-grid" onSubmit={handleVerifyOtp}>
              <label>
                One-time code
                <input
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  placeholder="Enter the code"
                  required
                />
              </label>
              <button className="primary-button auth-submit" type="submit" disabled={busy === "otp-verify"}>
                {busy === "otp-verify" ? "Verifying..." : "Verify phone"}
              </button>
            </form>
          </div>
        </div>
      )}
      <p className="auth-helper-text">
        <Link to="/login">Back to sign in</Link>
      </p>
    </PageSection>
  );
}
