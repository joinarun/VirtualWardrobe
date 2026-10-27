import { useState } from "react";
import type { FormEvent } from "react";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth-context";
import { rupees } from "../catalog-types";
import type { Product } from "../catalog-types";
import { EmptyState, Loading, Notice } from "../components/Common";
import { EnquiryTimeline } from "../components/EnquiryTimeline";
import { UiIcon } from "../components/UiIcon";
import type { Enquiry, EnquiryConfig, EnquiryStatus } from "../enquiry-types";
import { statuses, statusName, outcomeName } from "../enquiry-types";
import { checkedItems, useRemote } from "../remote";
import type { Page } from "../types";
import { dateTime } from "../tryon-types";
import { useVisibleResource } from "../use-visible-resource";
import { useUnsavedChanges } from "../navigation";
export function CallbackPage() {
  const auth = useAuth(),
    productId =
      new URLSearchParams(window.location.search).get("product") || "";
  const [revision, setRevision] = useState(0),
    [note, setNote] = useState(""),
    [consentVersion, setConsentVersion] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    enquiry: Enquiry;
    created: boolean;
  } | null>(null);
  useUnsavedChanges(Boolean(note.trim()) && !result);
  const configRequest = useRemote<EnquiryConfig>("/enquiries/config", revision),
    productRequest = useRemote<Product>(
      productId ? `/products/${encodeURIComponent(productId)}` : null,
      revision,
    );
  const config = configRequest.data,
    product = productRequest.data,
    consented = Boolean(config) && consentVersion === config?.consent.version;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!config || !product || !consented) return;
    setBusy(true);
    setError(null);
    try {
      setResult(
        await api<{ enquiry: Enquiry; created: boolean }>("/me/enquiries", {
          method: "POST",
          body: {
            productId: product.id,
            consent: { version: config.consent.version, shareContact: true },
            note: note.trim(),
          },
        }),
      );
      setNote("");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  if (result)
    return (
      <main className="account-page">
        <section className="form-card callback-confirmation">
          <p className="eyebrow">A HUMAN CONNECTION</p>
          <h1>
            {result.created
              ? "Your request is with the store."
              : "Keep the conversation going."}
          </h1>
          <Notice tone="success">
            {result.created
              ? "Your request has been sent. A salesperson from this store will contact you."
              : "You already have an active enquiry for this product. Open it to continue the conversation."}
          </Notice>
          <h2>{result.enquiry.product.title}</h2>
          <p>{result.enquiry.product.storeName}</p>
          <a
            className="primary-button full-width"
            href={`/account/enquiries/${result.enquiry.id}`}
          >
            Open my enquiry <UiIcon />
          </a>
          <a className="text-button" href="/account/enquiries">
            All my enquiries
          </a>
        </section>
      </main>
    );
  if (configRequest.loading || productRequest.loading)
    return <Loading message="Preparing the store contact details…" />;
  if (
    !productId ||
    !config ||
    !product ||
    configRequest.error ||
    productRequest.error
  )
    return (
      <main className="account-page">
        <section className="form-card">
          <h1>This callback is not available.</h1>
          <Notice>
            {configRequest.error ||
              productRequest.error ||
              "Choose a published, available product to start a callback request."}
          </Notice>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setRevision((v) => v + 1)}
            >
              Refresh details
            </button>
            <a href="/account/enquiries" className="text-button">
              My existing enquiries
            </a>
            <a href="/" className="text-button">
              Explore collection
            </a>
          </div>
        </section>
      </main>
    );
  const available =
    product.status === "PUBLISHED" && product.availability === "AVAILABLE";
  return (
    <main className="callback-page">
      <nav className="preview-breadcrumbs">
        <a href={`/products/${product.id}`}>
          <UiIcon kind="left" /> Product details
        </a>
        <a href="/account/enquiries">
          My enquiries <UiIcon />
        </a>
      </nav>
      <header className="tryon-title">
        <p className="eyebrow">A LITTLE CLOSER TO YOUR NEXT PIECE</p>
        <h1>Let the store reach out.</h1>
        <p>
          A callback request starts a conversation. It is not a confirmed order,
          payment or stock reservation.
        </p>
      </header>
      <div className="callback-layout">
        <aside className="callback-product panel">
          {product.coverUrl && (
            <img
              src={product.coverUrl}
              alt={product.title}
              width={280}
              height={420}
            />
          )}
          <p className="eyebrow">{product.storeName}</p>
          <h2>{product.title}</h2>
          <strong>{rupees(product.price)}</strong>
          <p>Reference: {product.sku}</p>
          <p className="form-hint">
            You can request a callback without creating or saving a try-on
            preview. Your photos are not shared with this store.
          </p>
        </aside>
        <section className="panel callback-form">
          <p className="eyebrow">YOUR CONTACT DETAILS</p>
          <h2>Share only what is needed.</h2>
          {!available && (
            <Notice tone="info">
              This piece is currently unavailable for a new request. Your
              existing enquiries remain accessible.
            </Notice>
          )}
          {error && <Notice>{error}</Notice>}
          <form onSubmit={(event) => void submit(event)}>
            <fieldset className="enquiry-fields" disabled={busy || !available}>
              <label className="field">
                <span>Name</span>
                <input value={auth.user?.name || ""} readOnly />
              </label>
              <label className="field">
                <span>Mobile number</span>
                <input value={auth.user?.phone || ""} readOnly />
              </label>
              <span className="badge badge-pending">Phone unverified</span>
              <p className="form-hint">
                The store receives the number on your customer account. Phone
                OTP verification is not available in this phase.
              </p>
              <label className="field">
                <span>
                  Note for the store <small>Optional</small>
                </span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={config.limits.noteChars}
                  rows={4}
                  placeholder="Ask about the fabric, availability or a suitable time to call."
                  aria-label="Note for the store"
                />
              </label>
              <section className="contact-consent">
                <p>{config.consent.notice}</p>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={consented}
                    onChange={(event) =>
                      setConsentVersion(
                        event.target.checked ? config.consent.version : null,
                      )
                    }
                    required
                  />
                  <span>
                    I agree to share my name, unverified mobile number, selected
                    product and note with {product.storeName} for this callback.
                  </span>
                </label>
                <small>Disclosure version: {config.consent.version}</small>
              </section>
              <button
                className="primary-button full-width"
                disabled={!consented || busy || !available}
                type="submit"
              >
                {busy ? "Sending request…" : "Request a callback"}
                <UiIcon />
              </button>
            </fieldset>
          </form>
          <button
            className="text-button service-refresh"
            type="button"
            disabled={busy}
            onClick={() => setRevision((v) => v + 1)}
          >
            Refresh contact disclosure
          </button>
          <a href="/account/enquiries" className="text-button">
            View my existing enquiries
          </a>
        </section>
      </div>
    </main>
  );
}
export function CustomerEnquiriesPage() {
  const [page, setPage] = useState(0),
    [status, setStatus] = useState<EnquiryStatus | "">("");
  const request = useVisibleResource<Page<Enquiry>>(
    `/me/enquiries?page=${page}&size=12${status ? `&status=${status}` : ""}`,
  );
  const items = checkedItems(request.data);
  return (
    <main className="customer-enquiries">
      <nav className="wardrobe-nav" aria-label="Your customer account">
        <a href="/account">Account</a>
        <a href="/account/previews">Previews</a>
        <a href="/account/gallery">Saved gallery</a>
        <a href="/account/enquiries" aria-current="page">
          My enquiries
        </a>
      </nav>
      <header className="page-title-row">
        <div>
          <p className="eyebrow">YOUR CONVERSATIONS WITH STORES</p>
          <h1>My enquiries.</h1>
          <p>
            Follow up on the pieces you love. Only your own requests appear
            here.
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={request.refresh}
        >
          Refresh enquiries
        </button>
      </header>
      <label className="field enquiry-status-filter">
        <span>Filter by status</span>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as EnquiryStatus | "");
            setPage(0);
          }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {statusName[value]}
            </option>
          ))}
        </select>
      </label>
      {request.error && (
        <Notice>
          {request.error}{" "}
          <button
            type="button"
            className="inline-button"
            onClick={request.refresh}
          >
            Retry
          </button>
        </Notice>
      )}
      {request.loading ? (
        <Loading message="Finding your enquiries…" />
      ) : !items.length ? (
        <section className="panel">
          <EmptyState title="A conversation starts with a piece.">
            Request a callback from a product page when you want a store to
            contact you. A try-on is optional.
          </EmptyState>
          <a className="primary-button" href="/">
            Find a piece <UiIcon />
          </a>
        </section>
      ) : (
        <>
          <div className="customer-enquiry-list">
            {items.map((enquiry) => (
              <a
                href={`/account/enquiries/${enquiry.id}`}
                className="enquiry-summary-card panel"
                key={enquiry.id}
              >
                <div>
                  <p className="eyebrow">{enquiry.product.storeName}</p>
                  <h2>{enquiry.product.title}</h2>
                  <p>
                    {enquiry.product.sku} · {rupees(enquiry.product.price)}
                  </p>
                  <small>Updated {dateTime(enquiry.updatedAt)}</small>
                </div>
                <div>
                  <span
                    className={`ticket-status ticket-${enquiry.status.toLowerCase()}`}
                  >
                    {statusName[enquiry.status]}
                  </span>
                  <UiIcon />
                </div>
              </a>
            ))}
          </div>
          <div className="pagination">
            <button
              className="secondary-button"
              type="button"
              disabled={page === 0}
              onClick={() => setPage((v) => v - 1)}
            >
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button
              className="secondary-button"
              type="button"
              disabled={
                !request.data ||
                (page + 1) * request.data.size >= request.data.total
              }
              onClick={() => setPage((v) => v + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}
export function CustomerEnquiryDetail({ id }: { id: string }) {
  const request = useVisibleResource<Enquiry>(
      `/me/enquiries/${encodeURIComponent(id)}`,
    ),
    config = useRemote<EnquiryConfig>("/enquiries/config");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [sent, setSent] = useState(false);
  const enquiry = request.data;
  const reply = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      request.replace(
        await api<Enquiry>(`/me/enquiries/${id}/messages`, {
          method: "POST",
          body: { text: message.trim() },
        }),
      );
      setMessage("");
      setSent(true);
    } catch (failure) {
      setError(errorMessage(failure));
      request.refresh();
    } finally {
      setBusy(false);
    }
  };
  if (request.loading)
    return <Loading message="Opening your store conversation…" />;
  if (!enquiry)
    return (
      <main className="account-page">
        <section className="form-card">
          <h1>This enquiry is not available.</h1>
          <Notice>
            {request.error || "It may belong to a different customer account."}
          </Notice>
          <a href="/account/enquiries" className="primary-button">
            My enquiries
          </a>
        </section>
      </main>
    );
  return (
    <main className="customer-enquiry-detail">
      <nav className="preview-breadcrumbs">
        <a href="/account/enquiries">
          <UiIcon kind="left" /> My enquiries
        </a>
        <button className="text-button" type="button" onClick={request.refresh}>
          Refresh conversation
        </button>
      </nav>
      <header className="page-title-row">
        <div>
          <p className="eyebrow">{enquiry.product.storeName}</p>
          <h1>{enquiry.product.title}</h1>
          <p>
            {enquiry.product.sku} · {rupees(enquiry.product.price)}
          </p>
        </div>
        <span
          className={`ticket-status ticket-${enquiry.status.toLowerCase()}`}
        >
          {statusName[enquiry.status]}
        </span>
      </header>
      {request.error && (
        <Notice>
          {request.error} The conversation below is the last received response.
        </Notice>
      )}
      <div className="customer-conversation-layout">
        <section className="panel conversation-panel">
          <h2>Your conversation.</h2>
          <p className="form-hint">
            Plain-text messages are shared with this store. Your photos and
            previews are not included.
          </p>
          <EnquiryTimeline events={enquiry.events || []} />
          {error && <Notice>{error}</Notice>}
          {sent && (
            <Notice tone="success">Your reply was sent to the store.</Notice>
          )}
          {enquiry.canReply ? (
            <form
              onSubmit={(event) => void reply(event)}
              className="public-reply-form"
            >
              <label className="field">
                <span>Your reply to the store</span>
                <textarea
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    setSent(false);
                  }}
                  maxLength={config.data?.limits.messageChars || 4000}
                  required
                  disabled={busy}
                  rows={4}
                />
              </label>
              <button
                className="primary-button"
                type="submit"
                disabled={busy || !message.trim()}
              >
                {busy ? "Sending…" : "Send reply"}
                <UiIcon />
              </button>
            </form>
          ) : (
            <Notice tone="info">
              {enquiry.status === "CLOSED"
                ? "This enquiry is closed and cannot receive replies. You can submit a new callback request from the product when it is available."
                : "Contact or message text is no longer available under the account/contact retention policy."}
            </Notice>
          )}
        </section>
        <aside className="panel enquiry-customer-context">
          <p className="eyebrow">YOUR REQUEST</p>
          <h2>The essentials.</h2>
          <dl>
            <div>
              <dt>Requested</dt>
              <dd>{dateTime(enquiry.createdAt)}</dd>
            </div>
            <div>
              <dt>Contact</dt>
              <dd>{enquiry.contact.name}</dd>
            </div>
            {enquiry.contact.phone && (
              <div>
                <dt>Mobile</dt>
                <dd>
                  {enquiry.contact.phone}{" "}
                  <span className="badge badge-pending">Unverified</span>
                </dd>
              </div>
            )}
            {enquiry.outcome && (
              <div>
                <dt>Closed outcome</dt>
                <dd>{outcomeName[enquiry.outcome]}</dd>
              </div>
            )}
          </dl>
          <a className="text-button" href={`/products/${enquiry.product.id}`}>
            View current product <UiIcon />
          </a>
          {enquiry.status === "CLOSED" && (
            <a
              className="secondary-button"
              href={`/callback?product=${enquiry.product.id}`}
            >
              Start a new callback request
            </a>
          )}
          <p className="form-hint">
            Your request keeps its product details even if the listing changes
            or is archived. Store staffing and internal notes are not part of
            your customer conversation.
          </p>
        </aside>
      </div>
    </main>
  );
}
