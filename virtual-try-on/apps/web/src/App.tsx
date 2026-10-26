import { UiIcon } from "./components/UiIcon";
import { Component } from "react";
import type { ReactNode } from "react";
import { AuthProvider } from "./auth";
import { useAuth } from "./auth-context";
import { Loading, Notice, SiteFooter, SiteHeader } from "./components/Common";
import { AccountPage } from "./pages/AccountPage";
import { AuthPage, PasswordChangePage } from "./pages/AuthPage";
import { Workspace } from "./pages/Workspace";
import { CatalogHome, ProductDetail } from "./pages/Catalog";
import { CustomerOnly } from "./components/CustomerOnly";
import { TryOnPage } from "./pages/TryOn";
import { PreviewPage } from "./pages/Preview";
import { WardrobePage } from "./pages/Wardrobe";
import {
  CallbackPage,
  CustomerEnquiriesPage,
  CustomerEnquiryDetail,
} from "./pages/CustomerEnquiries";
import "./enquiries.css";
import "./tryon.css";
import "./App.css";
import "./identity.css";
import "./catalog.css";

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
function Routes() {
  const auth = useAuth();
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (auth.user?.passwordChangeRequired)
    return (
      <>
        <SiteHeader />
        <div id="main-content" tabIndex={-1}>
          <PasswordChangePage />
        </div>
        <SiteFooter />
      </>
    );
  if (path.startsWith("/staff") && path !== "/staff/login") {
    if (auth.loading)
      return (
        <>
          <SiteHeader />
          <div id="main-content" tabIndex={-1}>
            <Loading />
          </div>
          <SiteFooter />
        </>
      );
    if (!auth.user || auth.user.kind !== "WORKFORCE")
      return (
        <>
          <SiteHeader />
          <div id="main-content" tabIndex={-1}>
            <AuthPage kind="WORKFORCE" />
          </div>
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
  else if (path === "/callback")
    page = (
      <CustomerOnly>
        <CallbackPage />
      </CustomerOnly>
    );
  else if (path === "/account/enquiries")
    page = (
      <CustomerOnly>
        <CustomerEnquiriesPage />
      </CustomerOnly>
    );
  else if (path.startsWith("/account/enquiries/"))
    page = (
      <CustomerOnly>
        <CustomerEnquiryDetail id={path.slice("/account/enquiries/".length)} />
      </CustomerOnly>
    );
  else if (path === "/try-on")
    page = (
      <CustomerOnly>
        <TryOnPage />
      </CustomerOnly>
    );
  else if (path === "/account/gallery")
    page = (
      <CustomerOnly>
        <WardrobePage gallery />
      </CustomerOnly>
    );
  else if (path === "/account/previews")
    page = (
      <CustomerOnly>
        <WardrobePage />
      </CustomerOnly>
    );
  else if (path.startsWith("/account/previews/"))
    page = (
      <CustomerOnly>
        <PreviewPage id={path.slice("/account/previews/".length)} />
      </CustomerOnly>
    );
  else if (path === "/account") page = <AccountPage />;
  else if (path.startsWith("/products/"))
    page = <ProductDetail id={path.slice("/products/".length)} />;
  else if (path === "/") page = <CatalogHome />;
  else
    page = (
      <div className="account-page">
        <section className="form-card">
          <h1>This page is not here.</h1>
          <p className="form-intro">
            Return to your wardrobe and find your next step.
          </p>
          <a className="primary-button" href="/">
            Back to storefront <UiIcon kind="right" />
          </a>
        </section>
      </div>
    );
  if (auth.loading && path === "/account") page = <Loading />;
  return (
    <>
      <SiteHeader />
      <div id="main-content" tabIndex={-1}>
        {page}
      </div>
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
