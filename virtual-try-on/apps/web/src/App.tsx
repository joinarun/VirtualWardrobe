import { Component } from "react";
import type { ReactNode } from "react";
import { AuthProvider } from "./auth";
import { useAuth } from "./auth-context";
import { Loading, Notice, SiteFooter, SiteHeader } from "./components/Common";
import { AccountPage } from "./pages/AccountPage";
import { AuthPage, PasswordChangePage } from "./pages/AuthPage";
import { Workspace } from "./pages/Workspace";
import "./App.css";
import "./identity.css";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="account-page">
        <section className="form-card">
          <h1>We could not load this space.</h1>
          <Notice>
            An unexpected response interrupted this page. Please refresh and try
            again.
          </Notice>
          <button
            type="button"
            className="secondary-button"
            onClick={() => window.location.reload()}
          >
            Refresh page
          </button>
          <a className="text-button" href="/">
            Return to storefront
          </a>
        </section>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Home() {
  const auth = useAuth();
  return (
    <>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">YOUR STYLE. YOUR PERSPECTIVE.</p>
            <h1>A new way to find your favourite drape.</h1>
            <p className="hero-description">
              Discover beautiful sarees from independent stores. Soon, see an AI
              preview on your own photo and connect with the people behind the
              collection.
            </p>
            <a
              href={
                auth.user?.kind === "CUSTOMER" ? "/account" : "/account/signup"
              }
              className="primary-button"
            >
              {auth.user?.kind === "CUSTOMER"
                ? "Open my wardrobe"
                : "Make room for your next favourite"}{" "}
              <span aria-hidden="true">→</span>
            </a>
            <div className="hero-note">
              <span>✧</span> Thoughtfully built around your privacy.
            </div>
          </div>
          <div className="hero-art hero-photograph">
            <img
              src="/demo/hero-emerald.png"
              alt="AI-created editorial image of a woman in an emerald saree with a gold border"
            />
            <div className="photo-caption">
              <span>THE ART OF</span>
              <em>finding your drape.</em>
            </div>
          </div>
        </section>
        {auth.error && (
          <div className="home-notice">
            <Notice>
              {auth.error}{" "}
              <button
                className="inline-button"
                onClick={() => void auth.reload()}
                type="button"
              >
                Retry connection
              </button>
            </Notice>
          </div>
        )}
        {new URLSearchParams(window.location.search).get("notice") ===
          "account-deleted" && (
          <div className="home-notice">
            <Notice tone="success">
              Your account deletion request was accepted and your session has
              ended.
            </Notice>
          </div>
        )}
        <section id="how-it-works" className="how-section">
          <div className="section-heading">
            <p className="eyebrow">FROM DISCOVERY TO CONVERSATION</p>
            <h2>See it. Picture it. Make it yours.</h2>
            <p>
              Shopping that starts with inspiration and ends with a human
              connection.
            </p>
          </div>
          <div className="steps">
            <article>
              <span>01 / DISCOVER</span>
              <h3>Find a piece you love.</h3>
              <p>
                Explore collections with the fabric, colour and detail that feel
                like you.
              </p>
            </article>
            <article>
              <span>02 / PREVIEW</span>
              <h3>A little imagination, made visible.</h3>
              <p>
                Get an illustrative AI preview. Garment details and fit may
                differ.
              </p>
            </article>
            <article>
              <span>03 / CONNECT</span>
              <h3>Talk to the store.</h3>
              <p>
                Request a callback and let a salesperson help with the next
                step.
              </p>
            </article>
          </div>
        </section>
        <section className="development-note">
          <div>
            <span className="tag">Accounts & store access are ready</span>
            <p>
              Product browsing and try-on tools are the next chapter. Create
              your personal account, or sign in to manage your store team.
            </p>
          </div>
          <a className="secondary-button" href="/staff">
            For store teams ↗
          </a>
        </section>
      </main>
    </>
  );
}
function Routes() {
  const auth = useAuth();
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (auth.user?.passwordChangeRequired)
    return (
      <>
        <SiteHeader />
        <PasswordChangePage />
        <SiteFooter />
      </>
    );
  if (path.startsWith("/staff") && path !== "/staff/login") {
    if (auth.loading)
      return (
        <>
          <SiteHeader />
          <Loading />
          <SiteFooter />
        </>
      );
    if (!auth.user || auth.user.kind !== "WORKFORCE")
      return (
        <>
          <SiteHeader />
          <AuthPage kind="WORKFORCE" />
          <SiteFooter />
        </>
      );
    return <Workspace />;
  }
  let page: ReactNode;
  if (path === "/staff/login") page = <AuthPage kind="WORKFORCE" />;
  else if (path === "/account/signup") page = <AuthPage mode="signup" />;
  else if (path === "/account/recover") page = <AuthPage mode="recover" />;
  else if (path === "/account/login") page = <AuthPage />;
  else if (path === "/account/password") page = <PasswordChangePage />;
  else if (path === "/account") page = <AccountPage />;
  else if (path === "/") page = <Home />;
  else
    page = (
      <div className="account-page">
        <section className="form-card">
          <h1>This page is not here.</h1>
          <p className="form-intro">
            Return to your wardrobe and find your next step.
          </p>
          <a className="primary-button" href="/">
            Back to storefront →
          </a>
        </section>
      </div>
    );
  if (auth.loading && path === "/account") page = <Loading />;
  return (
    <>
      <SiteHeader />
      {page}
      <SiteFooter />
    </>
  );
}
export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes />
      </AuthProvider>
    </ErrorBoundary>
  );
}
