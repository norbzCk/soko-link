import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AuthScene } from "../components/AuthScene";
import { apiRequest } from "../lib/http";

interface PasswordRecoveryRequestResponse {
  message: string;
  reset_token?: string;
}

interface PasswordRecoveryResetResponse {
  message: string;
}

export function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [requestError, setRequestError] = useState("");
  const [resetError, setResetError] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);

  const canShowResetStep = useMemo(() => hasRequested || Boolean(token.trim()), [hasRequested, token]);

  async function handleRequestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestError("");
    setRequestMessage("");
    setResetError("");
    setResetMessage("");
    setIsRequesting(true);

    try {
      const response = await apiRequest<PasswordRecoveryRequestResponse>("/auth/password-recovery/request", {
        method: "POST",
        auth: false,
        body: { identifier },
      });

      setRequestMessage(response.message);
      setHasRequested(true);

      if (response.reset_token) {
        setToken(response.reset_token);
      }
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Unable to start password recovery");
    } finally {
      setIsRequesting(false);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetError("");
    setResetMessage("");
    setIsResetting(true);

    try {
      const response = await apiRequest<PasswordRecoveryResetResponse>("/auth/password-recovery/reset", {
        method: "POST",
        auth: false,
        body: {
          token,
          new_password: newPassword,
        },
      });

      setResetMessage(response.message);
      setNewPassword("");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Unable to reset password");
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <AuthScene
      eyebrow="Recover account access"
      title="Reset your password and get back to work."
      description="Use your phone number or email to request a reset for buyer, seller, or logistics accounts. In development, a reset token can be used immediately on this page."
      bullets={[
        "Request recovery using the same account identifier you sign in with",
        "Supports buyer, seller, and delivery partner accounts",
        "Continue the reset flow on the same page with a secure token",
        "Return to login once your new password has been saved",
      ]}
      links={[
        { to: "/login", label: "Back to Sign in" },
        { to: "/register/customer", label: "Register as Customer" },
        { to: "/register/business", label: "Register as Business" },
        { to: "/register/logistics", label: "Register as Logistics" },
      ]}
    >
      <div className="auth-card-header">
        <div>
          <p className="eyebrow">Password recovery</p>
          <h2>Forgot password</h2>
        </div>
      </div>

      {requestError ? <p className="alert error">{requestError}</p> : null}
      {requestMessage ? <p className="alert success">{requestMessage}</p> : null}

      <form className="form-grid auth-form-grid" onSubmit={handleRequestReset}>
        <label>
          Phone or email
          <input
            name="identifier"
            placeholder="0700 000 000 or name@email.com"
            required
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
          />
        </label>
        <button className="primary-button auth-submit" disabled={isRequesting} type="submit">
          {isRequesting ? "Requesting..." : "Request reset"}
        </button>
      </form>

      {canShowResetStep ? (
        <>
          <div className="auth-card-header">
            <div>
              <p className="eyebrow">Set a new password</p>
              <h2>Reset password</h2>
            </div>
          </div>

          {resetError ? <p className="alert error">{resetError}</p> : null}
          {resetMessage ? <p className="alert success">{resetMessage}</p> : null}

          <form className="form-grid auth-form-grid" onSubmit={handleResetPassword}>
            <label>
              Reset token
              <input
                name="token"
                placeholder="Paste or confirm your reset token"
                required
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
            <label>
              New password
              <input
                name="new_password"
                type="password"
                placeholder="Enter a new password"
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <button className="primary-button auth-submit" disabled={isResetting} type="submit">
              {isResetting ? "Resetting..." : "Reset password"}
            </button>
          </form>
        </>
      ) : null}

      <p className="auth-helper-text">
        Remembered your password? <Link to="/login">Go back to sign in</Link>.
      </p>
    </AuthScene>
  );
}
