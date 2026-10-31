import { EditorialImage } from "../components/EditorialImage";
import { UiIcon } from "../components/UiIcon";
import { useState } from "react";
import type { FormEvent } from "react";
import { api, errorMessage, passwordError, refreshCsrf } from "../api";
import { useAuth } from "../auth-context";
import { executeCaptcha } from "../captcha";
import {
  Loading,
  LogoutButton,
  Notice,
  PasswordInput,
} from "../components/Common";
import type { AccountKind, User } from "../types";
import { authLink, customerReturnPath } from "../navigation";

type Mode = "login" | "signup" | "recover";
export function AuthPage({
  mode = "login",
  kind = "CUSTOMER",
  returnTo,
}: {
  mode?: Mode;
  kind?: AccountKind;
  returnTo?: string;
}) {
  const auth = useAuth();
  const destination = customerReturnPath(
    returnTo || new URLSearchParams(window.location.search).get("next"),
  );
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [localCheck, setLocalCheck] = useState(false);
  const [savedCodes, setSavedCodes] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(false);
  const workforce = kind === "WORKFORCE";
  const minimum = auth.config?.passwordMinLength || 12;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === "login" && !workforce && !/^\+?[0-9][0-9 ()-]{6,23}$/.test(identifier.trim())) {
      setError("Use your mobile number and VirtualWardrobe password to sign in.");
      return;
    }
    setBusy(true);
    try {
      if (mode !== "login") {
        const invalid = passwordError(password, minimum);
        if (invalid) throw Error(invalid);
        if (password !== confirmPassword)
          throw Error("The two passwords do not match.");
      }
      if (mode === "signup") {
        if (!auth.config?.signupEnabled)
          throw Error(
            "Self-signup is currently unavailable. Please try again later.",
          );
        if (!privacy)
          throw Error("Please read and accept the account privacy notice.");
        let captchaToken: string;
        if (auth.config.captcha.mode === "LOCAL_TEST") {
          if (!localCheck)
            throw Error(
              "Confirm that you are using this local development environment.",
            );
          captchaToken = "local-development";
        } else if (
          auth.config.captcha.mode === "RECAPTCHA_ENTERPRISE" &&
          auth.config.captcha.siteKey
        ) {
          captchaToken = await executeCaptcha(
            auth.config.captcha.siteKey,
            auth.config.captcha.action,
          );
        } else
          throw Error(
            "Signup security is not configured. Please try again later.",
          );
        const result = await api<{ user: User; recoveryCodes: string[] }>(
          "/auth/signup",
          {
            method: "POST",
            body: {
              name: name.trim(),
              countryCode,
              mobile: identifier.trim(),
              password,
              privacyAccepted: true,
              captchaToken,
            },
          },
        );
        setRecoveryCodes(result.recoveryCodes);
        setPassword("");
        setConfirmPassword("");
        await auth.completeAuth(result.user);
      } else if (mode === "recover") {
        await api<void>("/auth/recover", {
          method: "POST",
          body: {
            phone: identifier.trim(),
            recoveryCode: code.trim(),
            newPassword: password,
          },
        });
        setPassword("");
        setConfirmPassword("");
        setCode("");
        setRecovered(true);
        await refreshCsrf();
      } else {
        const result = await api<{ user: User }>("/auth/login", {
          method: "POST",
          body: { kind, identifier: identifier.trim(), password },
        });
        setPassword("");
        await auth.completeAuth(result.user);
        window.location.assign(
          result.user.passwordChangeRequired
            ? "/account/password"
            : result.user.kind === "WORKFORCE"
              ? "/staff"
              : destination,
        );
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  const downloadCodes = () => {
    const content = `Virtual Wardrobe recovery codes\nKeep these private. Each code can be used once to recover your customer account.\nAccount: ${auth.user?.phone || identifier}\n\n${recoveryCodes.join("\n")}\n`;
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "virtual-wardrobe-recovery-codes.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (recoveryCodes.length)
    return (
      <div className="account-page recovery-page">
        <section className="form-card wide-card">
          <p className="eyebrow">YOUR ACCOUNT IS READY</p>
          <h1>Keep a way back in.</h1>
          <p className="form-intro">
            These recovery codes appear only once. Save them somewhere private
            before continuing. Each code can reset your password once.
          </p>
          <Notice tone="info">
            Your mobile number is unverified. Phone OTP and phone-only recovery
            are not available in this phase.
          </Notice>
          <div className="recovery-codes" aria-label="One-time recovery codes">
            {recoveryCodes.map((item) => (
              <code key={item}>{item}</code>
            ))}
          </div>
          <button
            className="secondary-button"
            onClick={downloadCodes}
            type="button"
          >
            Download recovery codes
          </button>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={savedCodes}
              onChange={(event) => setSavedCodes(event.target.checked)}
            />
            <span>I have saved my recovery codes securely.</span>
          </label>
          <button
            className="primary-button full-width"
            disabled={!savedCodes}
            onClick={() => {
              setRecoveryCodes([]);
              window.location.assign(destination);
            }}
            type="button"
          >
            {destination === "/account"
              ? "Continue to my account"
              : "Continue to your preview"}{" "}
            <span aria-hidden="true">
              <UiIcon kind="right" />
            </span>
          </button>
        </section>
      </div>
    );
  if (recovered)
    return (
      <div className="account-page">
        <section className="form-card">
          <p className="eyebrow">A FRESH START</p>
          <h1>Your password is updated.</h1>
          <p className="form-intro">
            Previous sessions have ended. Sign in with your new password. The
            recovery code you just used cannot be used again.
          </p>
          <a
            className="primary-button full-width"
            href={authLink("/account/login", destination)}
          >
            Sign in{" "}
            <span aria-hidden="true">
              <UiIcon kind="right" />
            </span>
          </a>
        </section>
      </div>
    );
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <EditorialImage sizes="(max-width: 869px) 1px, (max-width: 1200px) 42vw, 480px" />
        <div>
          <p className="eyebrow">A WARDROBE THAT FEELS LIKE YOU</p>
          <h2>
            {workforce
              ? "Beautiful collections. Human connections."
              : "Your next favourite begins here."}
          </h2>
          <p>
            {workforce
              ? "A considered workspace for the people behind the collection."
              : "A personal place to discover, imagine and connect with independent stores."}
          </p>
        </div>
      </aside>
      <section className="form-card">
        <p className="eyebrow">
          {workforce
            ? "FOR STORE TEAMS"
            : mode === "signup"
              ? "WELCOME TO YOUR WARDROBE"
              : mode === "recover"
                ? "RECOVER YOUR CUSTOMER ACCOUNT"
                : "WELCOME BACK"}
        </p>
        <h1>
          {mode === "signup"
            ? "Make yourself at home."
            : mode === "recover"
              ? "Find your way back."
              : workforce
                ? "Sign in to your workspace."
                : "Good to see you again."}
        </h1>
        <p className="form-intro">
          {mode === "signup"
            ? "Create an account with your mobile number and a password."
            : mode === "recover"
              ? "Use an unused recovery code saved when you created your account."
              : workforce
                ? "Use your store-issued VirtualWardrobe email and password."
                : "Sign in with your VirtualWardrobe mobile number and password."}
        </p>
        {auth.error && (
          <Notice>
            {auth.error}{" "}
            <button
              type="button"
              className="inline-button"
              onClick={() => void auth.reload()}
            >
              Retry connection
            </button>
          </Notice>
        )}
        {auth.user && (
          <Notice tone="info">
            You are currently signed in as {auth.user.name} with a{" "}
            {auth.user.kind === "WORKFORCE" ? "store" : "customer"} account.
            Signing in here switches this browser session.
          </Notice>
        )}
        {mode === "signup" && (auth.loading || auth.configLoading) ? (
          <Loading message="Loading signup security…" />
        ) : mode === "signup" &&
          (!auth.config || !auth.config.signupEnabled) ? (
          <>
            <Notice tone="info">
              {auth.configError ||
                "Self-signup is currently unavailable. Store sign-in and existing customer sign-in remain available."}
            </Notice>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void auth.reload()}
            >
              Check availability again
            </button>
          </>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            {error && <Notice>{error}</Notice>}
            {mode === "signup" && (
              <label className="field" htmlFor="signup-name">
                <span>Your name</span>
                <input
                  id="signup-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={100}
                  autoComplete="name"
                />
              </label>
            )}
            {mode === "signup" ? (
              <div className="phone-fields">
                <label className="field" htmlFor="country-code">
                  <span>Country code</span>
                  <select
                    id="country-code"
                    value={countryCode}
                    onChange={(event) => setCountryCode(event.target.value)}
                  >
                    <option value="+91">India +91</option>
                    <option value="+1">US / Canada +1</option>
                    <option value="+44">UK +44</option>
                    <option value="+61">Australia +61</option>
                  </select>
                </label>
                <label className="field" htmlFor="mobile-number">
                  <span>Mobile number</span>
                  <input
                    id="mobile-number"
                    type="tel"
                    inputMode="tel"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    required
                    autoComplete="tel-national"
                    maxLength={20}
                  />
                </label>
              </div>
            ) : (
              <label className="field" htmlFor="identifier">
                <span>
                  {workforce
                    ? "Email address"
                    : "Mobile number with country code"}
                </span>
                <input
                  id="identifier"
                  type={workforce ? "email" : "tel"}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder={
                    workforce ? "you@yourstore.com" : "+91 98765 43210"
                  }
                  required
                  autoComplete={workforce ? "username" : "tel"}
                  maxLength={workforce ? 254 : 24}
                />
              </label>
            )}
            {mode === "recover" && (
              <label className="field" htmlFor="recovery-code">
                <span>Unused recovery code</span>
                <input
                  id="recovery-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                  autoComplete="off"
                  maxLength={120}
                  spellCheck={false}
                />
                <small className="form-hint">
                  Knowing a phone number alone cannot recover an account.
                </small>
              </label>
            )}
            <PasswordInput
              id="auth-password"
              label={mode === "recover" ? "New password" : "Password"}
              value={password}
              onChange={setPassword}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minimum={mode === "login" ? 1 : minimum}
            />
            {mode !== "login" && (
              <>
                <p className="form-hint password-hint">
                  Use at least {minimum} characters. Choose a password you do
                  not use elsewhere.
                </p>
                <PasswordInput
                  id="confirm-password"
                  label="Confirm password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  minimum={minimum}
                />
              </>
            )}
            {mode === "signup" && (
              <>
                <Notice tone="info">
                  We do not verify phone ownership yet. Your number is marked
                  unverified, and password recovery requires one of your
                  recovery codes.
                </Notice>
                <details className="privacy-details">
                  <summary>How we use your account details</summary>
                  <p>
                    Your name and mobile number identify your customer account.
                    A store receives your contact details only when you
                    separately request its callback. Personal photo processing
                    starts only when you create a preview. Your recovery codes are shown
                    once and stored only as hashes.
                  </p>
                </details>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={privacy}
                    onChange={(event) => setPrivacy(event.target.checked)}
                    required
                  />
                  <span>
                    I have read and agree to the account privacy notice.
                  </span>
                </label>
                {auth.config?.captcha.mode === "LOCAL_TEST" && (
                  <div className="local-captcha">
                    <span className="tag">Local development only</span>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={localCheck}
                        onChange={(event) =>
                          setLocalCheck(event.target.checked)
                        }
                        required
                      />
                      <span>
                        I am testing in the local development environment.
                      </span>
                    </label>
                    <small>
                      This explicit test adapter is replaced by a real security
                      assessment when deployed.
                    </small>
                  </div>
                )}
                {auth.config?.captcha.mode === "RECAPTCHA_ENTERPRISE" && (
                  <p className="form-hint">
                    Signup is protected by Google reCAPTCHA. A security
                    assessment runs when you submit this form.
                  </p>
                )}
              </>
            )}
            <button
              className="primary-button full-width"
              type="submit"
              disabled={busy}
            >
              {busy
                ? mode === "signup"
                  ? "Creating your account…"
                  : mode === "recover"
                    ? "Updating password…"
                    : "Signing in…"
                : mode === "signup"
                  ? "Create my account"
                  : mode === "recover"
                    ? "Reset password"
                    : "Sign in"}
              <span aria-hidden="true">
                <UiIcon kind="right" />
              </span>
            </button>
          </form>
        )}
        <div className="auth-links">
          {!workforce && mode === "login" && (
            <>
              <a href={authLink("/account/recover", destination)}>
                Forgot your password?
              </a>
              <p>
                New here?{" "}
                <a href={authLink("/account/signup", destination)}>
                  Create an account
                </a>
              </p>
            </>
          )}
          {mode === "signup" && (
            <p>
              Already have an account?{" "}
              <a href={authLink("/account/login", destination)}>Sign in</a>
            </p>
          )}
          {mode === "recover" && (
            <>
              <p>
                Lost every recovery code? Automated recovery is unavailable.
                Support cannot restore an account from a phone number alone.
              </p>
              <a href={authLink("/account/login", destination)}>
                <UiIcon kind="left" /> Back to sign in
              </a>
            </>
          )}
          {workforce ? (
            <>
              <p>
                Need access or a password reset? Contact your store
                administrator or the platform operator.
              </p>
              <a
                aria-label="Customer sign-in →"
                href={authLink("/account/login", destination)}
              >
                Customer sign-in <UiIcon kind="right" />
              </a>
            </>
          ) : (
            <a className="muted-link" href="/staff/login">
              Store team sign-in <UiIcon kind="right" />
            </a>
          )}
        </div>
      </section>
    </div>
  );
}

export function PasswordChangePage() {
  const auth = useAuth();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (auth.loading) return <Loading />;
  if (!auth.user) return <AuthPage />;
  const required = auth.user.passwordChangeRequired;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const invalid = passwordError(
        password,
        auth.config?.passwordMinLength || 12,
      );
      if (invalid) throw Error(invalid);
      if (password !== confirm)
        throw Error("The two new passwords do not match.");
      await api<void>("/auth/password", {
        method: "POST",
        body: { currentPassword: current, newPassword: password },
      });
      await refreshCsrf();
      const user = await auth.refreshUser();
      window.location.assign(
        user?.kind === "WORKFORCE"
          ? "/staff?notice=password-updated"
          : "/account?notice=password-updated",
      );
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="account-page">
      <section className="form-card">
        <p className="eyebrow">
          {required ? "ONE IMPORTANT FIRST STEP" : "ACCOUNT SECURITY"}
        </p>
        <h1>
          {required
            ? "Choose a password of your own."
            : "Update your password."}
        </h1>
        <p className="form-intro">
          {required
            ? "Your temporary password gets you started. Change it before accessing your store workspace."
            : "Changing your password ends your other sessions."}
        </p>
        {required && (
          <Notice tone="info">
            Store tools remain unavailable until this step is complete.
          </Notice>
        )}
        <form onSubmit={(event) => void submit(event)}>
          {error && <Notice>{error}</Notice>}
          <PasswordInput
            id="current-password"
            label={required ? "Temporary password" : "Current password"}
            value={current}
            onChange={setCurrent}
            minimum={1}
          />
          <PasswordInput
            id="new-password"
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <PasswordInput
            id="new-password-confirm"
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          <p className="form-hint">
            Use at least {auth.config?.passwordMinLength || 12} characters.
          </p>
          <button
            className="primary-button full-width"
            disabled={busy}
            type="submit"
          >
            {busy ? "Updating password…" : "Save new password"}
            <span aria-hidden="true">
              <UiIcon kind="right" />
            </span>
          </button>
        </form>
        <div className="auth-links">
          <LogoutButton />
          {!required && (
            <a href={auth.user.kind === "WORKFORCE" ? "/staff" : "/account"}>
              Cancel
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
