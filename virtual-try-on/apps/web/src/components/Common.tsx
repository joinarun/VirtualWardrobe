import { UiIcon } from "./UiIcon";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { errorMessage } from "../api";
import { useAuth } from "../auth-context";
import { ThemeChooser } from "./ThemeChooser";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <a className={`wordmark ${light ? "light" : ""}`} href="/">
      Virtual<span>Wardrobe</span>
    </a>
  );
}
export function SiteHeader() {
  const { user, status } = useAuth();
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Brand />
        <nav aria-label="Customer navigation">
          <a className="desktop-nav-link" href="/#collection">Collection</a>
          <a className="desktop-nav-link" href="/account/previews">My previews</a>
          <ThemeChooser />
          <a
            className="account-link"
            href={
              user?.kind === "WORKFORCE"
                ? "/staff"
                : user || status === "unknown"
                  ? "/account"
                  : "/account/login"
            }
          >
            <UiIcon kind="user" /><span>{user
                ? user.kind === "WORKFORCE"
                  ? "My workspace"
                  : "My account"
                : "Account"}</span>
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
      <a href="/privacy">Privacy</a>
      <a href="/staff">
        For stores <UiIcon kind="up-right" />
      </a>
      <span>© 2026 Virtual Wardrobe</span>
    </footer>
  );
}
export function MobileNavigation() {
  useEffect(() => {
    const update = () => {
      const input = document.activeElement;
      const typing = input instanceof HTMLTextAreaElement ||
        (input instanceof HTMLInputElement && !["file", "checkbox", "radio", "button", "submit"].includes(input.type));
      const compressed = Boolean(window.visualViewport && window.innerHeight - window.visualViewport.height > 120);
      document.documentElement.dataset.keyboardOpen = String(typing && compressed);
    };
    window.visualViewport?.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      delete document.documentElement.dataset.keyboardOpen;
    };
  }, []);
  const path = window.location.pathname;
  const active = path === "/account/gallery" ? "Saved"
    : path.startsWith("/account/previews") ? "Previews"
    : path.startsWith("/account") || path === "/callback" ? "Account" : "Collection";
  const items = [
    ["Collection", "/", "home"], ["Previews", "/account/previews", "sparkle"],
    ["Saved", "/account/gallery", "heart"], ["Account", "/account", "user"],
  ] as const;
  return <nav className="mobile-navigation" aria-label="Mobile navigation">{items.map(([label, href, kind]) =>
    <a key={label} href={href} aria-current={active === label ? "page" : undefined}><UiIcon kind={kind} /><span>{label}</span></a>)}</nav>;
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
export function SessionReconnect() {
  const auth = useAuth();
  return <main className="account-page"><section className="form-card">
    <p className="eyebrow">YOUR WARDROBE IS WAITING</p>
    <h1>Reconnect to your wardrobe.</h1>
    <p className="form-intro">We could not check your session. Try your connection again to pick up where you left off.</p>
    <button type="button" className="primary-button" onClick={() => void auth.reload()}>Retry connection</button>
    <a href="/" className="text-button">Browse the collection</a>
  </section></main>;
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
