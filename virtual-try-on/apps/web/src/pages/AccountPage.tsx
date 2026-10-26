import { UiIcon } from "../components/UiIcon";
import { useState } from "react";
import type { FormEvent } from "react";
import { api, clearCsrf, errorMessage } from "../api";
import { useAuth } from "../auth-context";
import {
  EmptyState,
  Loading,
  LogoutButton,
  Notice,
  PasswordInput,
} from "../components/Common";
import { AuthPage } from "./AuthPage";

export function AccountPage() {
  const auth = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (auth.loading) return <Loading />;
  if (!auth.user) return <AuthPage />;
  if (auth.user.kind !== "CUSTOMER")
    return (
      <div className="account-page">
        <section className="form-card">
          <p className="eyebrow">TWO DISTINCT SPACES</p>
          <h1>Your store account is signed in.</h1>
          <p className="form-intro">
            Customer accounts use a separate mobile-number sign-in. A workforce
            role does not give access to a customer's private workspace.
          </p>
          <div className="button-row">
            <a className="primary-button" href="/staff">
              Open store workspace <UiIcon kind="right" />
            </a>
            <a className="secondary-button" href="/account/login">
              Switch to customer sign-in
            </a>
          </div>
        </section>
      </div>
    );
  const submitDeletion = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api<void>("/me", {
        method: "DELETE",
        body: { password, confirm: confirmed },
      });
      clearCsrf();
      window.location.assign("/?notice=account-deleted");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="customer-account">
      <header className="page-title-row">
        <div>
          <p className="eyebrow">YOUR PERSONAL SPACE</p>
          <h1>Hello, {auth.user.name}.</h1>
          <p>A little inspiration, and an account that stays yours.</p>
        </div>
        <LogoutButton className="secondary-button" />
      </header>
      {new URLSearchParams(window.location.search).get("notice") ===
        "password-updated" && (
        <Notice tone="success">
          Your password was updated and your other sessions have ended.
        </Notice>
      )}
      {auth.error && <Notice>{auth.error}</Notice>}
      <div className="account-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ACCOUNT DETAILS</p>
              <h2>The essentials.</h2>
            </div>
            <span className="avatar">
              {auth.user.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Name</dt>
              <dd>{auth.user.name}</dd>
            </div>
            <div>
              <dt>Mobile number</dt>
              <dd>{auth.user.phone}</dd>
            </div>
            <div>
              <dt>Verification</dt>
              <dd>
                <span className="badge badge-pending">Phone unverified</span>
              </dd>
            </div>
          </dl>
          <p className="form-hint">
            Phone OTP and self-service phone changes are planned for a later
            phase. Your recovery codes are needed if you forget your password.
          </p>
          <a className="secondary-button" href="/account/password">
            Change password
          </a>
        </section>
        <section className="panel">
          <EmptyState title="Your wardrobe, your point of view.">
            Return to recent requests or keep inspiration in your saved gallery.
            Your personal photos stay separate from the store workspace.
          </EmptyState>
          <div className="button-row">
            <a className="primary-button" href="/account/previews">
              My previews <UiIcon kind="right" />
            </a>
            <a className="secondary-button" href="/account/gallery">
              Saved gallery
            </a>
            <a className="secondary-button" href="/account/enquiries">
              My enquiries
            </a>
          </div>
          <a className="text-button" href="/">
            Explore the storefront <UiIcon kind="right" />
          </a>
        </section>
      </div>
      <section className="account-security panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">YOUR DATA, YOUR CHOICE</p>
            <h2>Account privacy.</h2>
          </div>
        </div>
        <p>
          Recovery codes are shown only when your account is created. We cannot
          display them again or reset an account using a phone number alone.
        </p>
        {!deleting ? (
          <button
            className="text-button danger-text"
            onClick={() => setDeleting(true)}
            type="button"
          >
            Delete my customer account
          </button>
        ) : (
          <form
            className="compact-form danger-form"
            onSubmit={(event) => void submitDeletion(event)}
          >
            <Notice tone="info">
              Deletion signs you out and schedules private media removal and
              contact anonymization. Already issued private-media links may
              remain valid for up to five minutes, and backup retention is
              separate.
            </Notice>
            {error && <Notice>{error}</Notice>}
            <PasswordInput
              id="delete-password"
              label="Confirm your password"
              value={password}
              onChange={setPassword}
              minimum={1}
            />
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                required
              />
              <span>
                I understand that my customer account will be deleted.
              </span>
            </label>
            <div className="button-row">
              <button
                className="danger-button"
                disabled={busy || !confirmed}
                type="submit"
              >
                {busy ? "Requesting deletion…" : "Delete my account"}
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setDeleting(false);
                  setPassword("");
                  setConfirmed(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
