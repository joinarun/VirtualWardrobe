import { UiIcon } from "./UiIcon";
import { useState } from "react";
import type { ReactNode } from "react";
import { errorMessage } from "../api";
import { useAuth } from "../auth-context";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <a className={`wordmark ${light ? "light" : ""}`} href="/">
      Virtual<span>Wardrobe</span>
    </a>
  );
}
export function SiteHeader() {
  const { user, loading } = useAuth();
  return (
    <>
      <div className="announcement">
        A more personal way to discover Indian style.
      </div>
      <header className="site-header">
        <Brand />
        <nav aria-label="Customer navigation">
          <a href="/#how-it-works">How it works</a>
          <a
            className="account-link"
            href={
              user?.kind === "WORKFORCE"
                ? "/staff"
                : user
                  ? "/account"
                  : "/account/login"
            }
          >
            {loading
              ? "Account"
              : user
                ? user.kind === "WORKFORCE"
                  ? "My workspace"
                  : "My account"
                : "Sign in"}
          </a>
          <a className="workspace-link" href="/staff">
            Store workspace{" "}
            <span>
              <UiIcon kind="up-right" />
            </span>
          </a>
        </nav>
      </header>
    </>
  );
}
export function SiteFooter() {
  return (
    <footer>
      <Brand />
      <p>Style is personal. Your photos should be, too.</p>
      <a href="/staff">
        For stores <UiIcon kind="up-right" />
      </a>
      <span>© 2026 Virtual Wardrobe</span>
    </footer>
  );
}
export function Notice({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success" | "info";
}) {
  return (
    <div
      className={`notice notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Loading({
  message = "Preparing your space…",
}: {
  message?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" />
      {message}
    </div>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-symbol">
        <UiIcon kind="sparkle" />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function PasswordInput({
  id,
  label,
  autoComplete = "current-password",
  minimum = 12,
  required = true,
  value,
  onChange,
}: {
  id: string;
  label: string;
  autoComplete?: string;
  minimum?: number;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <span className="password-field">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          minLength={minimum}
          maxLength={72}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </span>
    </div>
  );
}
export function LogoutButton({
  className = "text-button",
  after,
}: {
  className?: string;
  after?: () => void;
}) {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        className={className}
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await logout();
            if (after) after();
            else window.location.assign("/");
          } catch (failure) {
            setError(errorMessage(failure));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      {error && <Notice>{error}</Notice>}
    </>
  );
}
export function CredentialNotice({
  email,
  password,
  onDismiss,
}: {
  email: string;
  password: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  return (
    <section
      className="credential-card"
      aria-label="One-time temporary credential"
    >
      <div className="card-title-row">
        <div>
          <p className="eyebrow">SHOWN ONCE</p>
          <h3>Share this temporary sign-in securely.</h3>
        </div>
      </div>
      <p>
        The recipient must change their password before using the workspace.
        This credential expires after 24 hours.
      </p>
      <dl className="credential-values">
        <div>
          <dt>Email</dt>
          <dd>{email}</dd>
        </div>
        <div>
          <dt>Temporary password</dt>
          <dd>
            <code>{password}</code>
          </dd>
        </div>
      </dl>
      <div className="button-row">
        <button
          className="secondary-button"
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                `Email: ${email}\nTemporary password: ${password}`,
              );
              setCopied(true);
              setCopyError(false);
            } catch {
              setCopied(false);
              setCopyError(true);
            }
          }}
        >
          {copied ? "Copied" : "Copy credential"}
        </button>
        <button className="text-button" type="button" onClick={onDismiss}>
          I have saved it — dismiss
        </button>
      </div>
      {copyError && (
        <Notice tone="info">
          Copying is unavailable in this browser. Select the credential text and
          save it securely.
        </Notice>
      )}
      <p className="form-hint">
        Share only with this person through a secure channel. It will not be
        shown again after you leave this page.
      </p>
    </section>
  );
}
