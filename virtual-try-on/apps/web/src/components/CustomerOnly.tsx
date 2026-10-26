import { Fragment } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../auth-context";
import { authLink } from "../navigation";
import { AuthPage } from "../pages/AuthPage";
import { Loading } from "./Common";
export function CustomerOnly({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const returnTo = window.location.pathname + window.location.search;
  if (auth.loading) return <Loading />;
  if (!auth.user) return <AuthPage returnTo={returnTo} />;
  if (auth.user.kind !== "CUSTOMER")
    return (
      <main className="account-page">
        <section className="form-card">
          <p className="eyebrow">YOUR PHOTOS HAVE THEIR OWN SPACE</p>
          <h1>Use a customer account.</h1>
          <p className="form-intro">
            Your store account does not open a customer's private photos or
            previews. Sign in with your customer mobile number to continue.
          </p>
          <a
            className="primary-button"
            href={authLink("/account/login", returnTo)}
          >
            Switch to customer sign-in
          </a>
          <a className="text-button" href="/staff">
            Return to store workspace
          </a>
        </section>
      </main>
    );
  // Account switches unmount every private view and its local photo/object URLs.
  return <Fragment key={auth.user.id}>{children}</Fragment>;
}
