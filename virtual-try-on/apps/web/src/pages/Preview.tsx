import { UiIcon } from "../components/UiIcon";
import { useState } from "react";
import { api, errorMessage } from "../api";
import { rupees } from "../catalog-types";
import { Loading, Notice } from "../components/Common";
import type { TryOnJob } from "../tryon-types";
import { dateTime, privatePath } from "../tryon-types";
import { useJob } from "../use-job";
import { useRemote } from "../remote";
import type { Product } from "../catalog-types";

const stateLabels = {
  QUEUED: "Queued",
  RUNNING: "Creating your preview",
  SUCCEEDED: "Preview ready",
  FAILED: "Preview could not be completed",
  EXPIRED: "Preview expired",
  CANCELLED: "Request cancelled",
};
export function PrivatePreviewImage({
  url,
  title,
  onRefresh,
}: {
  url: string;
  title: string;
  onRefresh: () => void;
}) {
  const [failure, setFailure] = useState(false);
  const [revision, setRevision] = useState(0);
  return (
    <div className="private-preview-image">
      {failure ? (
        <div className="private-image-error">
          <p>This private image could not load.</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setFailure(false);
              setRevision((v) => v + 1);
              onRefresh();
            }}
          >
            Reload private image
          </button>
        </div>
      ) : (
        <img
          key={`${url}:${revision}`}
          src={privatePath(url)}
          alt={`Private preview of ${title}`}
          onError={() => setFailure(true)}
          decoding="async"
        />
      )}
    </div>
  );
}
export function PreviewPage({ id }: { id: string }) {
  const request = useJob(id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"cancel" | "discard" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const job = request.job;
  const currentProduct = useRemote<Product>(
    job ? `/products/${job.productId}` : null,
  );
  const act = async (action: "cancel" | "save" | "discard") => {
    if (!job) return;
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      if (action === "discard") {
        await api<void>(`/me/try-on/jobs/${id}`, { method: "DELETE" });
        window.location.assign("/account/previews?notice=discarded");
        return;
      }
      const updated = await api<TryOnJob>(`/me/try-on/jobs/${id}/${action}`, {
        method: "POST",
        body: {},
      });
      request.replace(updated);
      setConfirm(null);
      setMessage(
        action === "save"
          ? updated.result?.saving
            ? "Your gallery save is being completed. This page will check its status."
            : updated.result?.saved
              ? "Preview saved to your private gallery."
              : "The request changed before saving completed. Review its current state."
          : updated.state === "CANCELLED"
            ? "Request cancelled. Any processing already started at the provider cannot be undone."
            : "The request had already completed. Review or discard the current result.",
      );
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };
  if (request.loading)
    return <Loading message="Finding your private request…" />;
  if (!job)
    return (
      <main className="account-page">
        <section className="form-card">
          <p className="eyebrow">YOUR PRIVATE SPACE</p>
          <h1>This preview is not available.</h1>
          <Notice>
            {request.error ||
              "It may have been removed, or it may belong to a different customer account."}
          </Notice>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={request.refresh}
            >
              Refresh request
            </button>
            <a href="/account/previews" className="text-button">
              My previews <UiIcon kind="right" />
            </a>
          </div>
        </section>
      </main>
    );
  const result = job.result;
  const canStartAgain =
    job.state === "CANCELLED" ||
    (["FAILED", "EXPIRED"].includes(job.state) &&
      job.error?.canRetry !== false);
  return (
    <main className="preview-page">
      <nav className="preview-breadcrumbs">
        <a href="/account/previews">
          <UiIcon kind="left" /> My previews
        </a>
        <a href="/account/gallery">
          Saved gallery <UiIcon kind="up-right" />
        </a>
      </nav>
      <header className="page-title-row">
        <div>
          <p className="eyebrow">YOUR PRIVATE PREVIEW</p>
          <h1>{job.discarded ? "Preview removed" : stateLabels[job.state]}</h1>
          <p>
            {job.product.title} · {job.product.storeName}
          </p>
        </div>
        <span className={`preview-state state-${job.state.toLowerCase()}`}>
          {job.state}
        </span>
      </header>
      {request.error && (
        <Notice>
          {request.error} The status below is the last response received.{" "}
          <button
            className="inline-button"
            type="button"
            onClick={request.refresh}
          >
            Refresh status
          </button>
        </Notice>
      )}
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <section className="preview-mode-notice" aria-label="Preview mode">
        <span className="mode-label">{job.label}</span>
        <p>{job.notice}</p>
        {job.demo && (
          <p>
            This is a local demonstration fixture, not an actual generated
            try-on.
          </p>
        )}
      </section>
      <div className="preview-layout">
        <section className="preview-result-panel">
          {result ? (
            <>
              <PrivatePreviewImage
                key={result.id}
                url={result.imageUrl}
                title={job.product.title}
                onRefresh={request.refresh}
              />
              <div className="result-image-caption">
                <span>{job.label}</span>
                <strong>
                  {result.saved
                    ? "Saved privately"
                    : result.saving
                      ? "Saving privately…"
                      : "Not saved"}
                </strong>
              </div>
            </>
          ) : job.state === "QUEUED" || job.state === "RUNNING" ? (
            <div className="generation-state" role="status">
              <span className="generation-orbit" aria-hidden="true">
                <UiIcon kind="sparkle" />
              </span>
              <h2>
                {job.state === "QUEUED"
                  ? "Your request is in the queue."
                  : "A little imagination is taking shape."}
              </h2>
              <p>
                {job.state === "QUEUED"
                  ? "Your request is stored. You can leave and return to this page."
                  : "The provider is processing your request. This page checks the real status; there is no percentage estimate."}
              </p>
              <span className="spinner" />
            </div>
          ) : (
            <div className="generation-state terminal-state">
              <span aria-hidden="true">
                <UiIcon
                  kind={job.state === "CANCELLED" ? "circle" : "sparkle"}
                />
              </span>
              <h2>
                {job.discarded
                  ? "This result was removed."
                  : job.state === "CANCELLED"
                    ? "This request has ended."
                    : job.state === "EXPIRED"
                      ? "This preview's time has passed."
                      : "There is no image to show."}
              </h2>
              <p>
                {job.discarded
                  ? "New image access is removed. The result will not be restored by late processing."
                  : job.error?.message ||
                    "There is no image available for this request."}
              </p>
            </div>
          )}
        </section>
        <aside className="preview-actions panel">
          <p className="eyebrow">A PIECE FROM YOUR COLLECTION</p>
          <h2>{job.product.title}</h2>
          <p className="preview-store">
            {job.product.storeName} · {job.product.sku}
          </p>
          <strong className="preview-product-price">
            {rupees(job.product.price)}
          </strong>
          <dl className="preview-details">
            <div>
              <dt>Requested</dt>
              <dd>{dateTime(job.createdAt)}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{job.provider}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{job.model}</dd>
            </div>
            {result?.expiresAt && !result.saved && (
              <div>
                <dt>Unsaved access expires</dt>
                <dd>{dateTime(result.expiresAt)}</dd>
              </div>
            )}
          </dl>
          {job.error && (
            <Notice tone="info">
              {job.error.message}
              {job.error.code === "UNKNOWN_OUTCOME" && (
                <p>
                  The previous provider outcome is unknown and was not
                  automatically retried. Starting again is a new, deliberate
                  request.
                </p>
              )}
            </Notice>
          )}
          {result && (
            <div className="result-actions">
              {result.saved ? (
                <a
                  className="primary-button full-width"
                  href="/account/gallery"
                >
                  Open saved gallery{" "}
                  <span aria-hidden="true">
                    <UiIcon kind="up-right" />
                  </span>
                </a>
              ) : (
                <button
                  className="primary-button full-width"
                  type="button"
                  disabled={busy !== null || !job.canSave || result.saving}
                  onClick={() => void act("save")}
                >
                  {busy === "save" || result.saving
                    ? "Saving to gallery…"
                    : "Save to my gallery"}
                </button>
              )}
              <a
                className="secondary-button full-width"
                href={privatePath(result.downloadUrl)}
              >
                Download preview{" "}
                <span aria-hidden="true">
                  <UiIcon kind="down" />
                </span>
              </a>
              <p className="form-hint">
                Downloading saves a copy to your device. Saving to your gallery
                is a separate action.
              </p>
            </div>
          )}
          {result && !result.saved && !result.saving && !job.canSave && (
            <Notice tone="info">
              Saving is currently unavailable.{" "}
              <a href="/account/gallery">Manage your saved gallery</a> or
              refresh the request for its current state.
            </Notice>
          )}
          {job.canCancel && (
            <button
              type="button"
              className="secondary-button full-width"
              disabled={busy !== null}
              onClick={() => setConfirm("cancel")}
            >
              Cancel this request
            </button>
          )}
          {job.canDiscard && (
            <button
              type="button"
              className="text-button danger-text"
              disabled={busy !== null}
              onClick={() => setConfirm("discard")}
            >
              {result?.saved ? "Delete this preview" : "Discard this request"}
            </button>
          )}
          {confirm && (
            <section className="preview-confirm">
              <h3>
                {confirm === "cancel"
                  ? "Cancel this request?"
                  : "Remove this request and its images?"}
              </h3>
              <p>
                {confirm === "cancel"
                  ? "This stops new app access to any late result. Processing may already have started at the provider."
                  : "This removes new image access immediately and schedules object removal within 24 hours. Previously issued links may work for up to five minutes; provider and backup retention are separate."}
              </p>
              <div className="button-row">
                <button
                  className="danger-button"
                  disabled={busy !== null}
                  type="button"
                  onClick={() => void act(confirm)}
                >
                  {busy
                    ? "Updating…"
                    : confirm === "cancel"
                      ? "Confirm cancellation"
                      : "Confirm discard"}
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setConfirm(null)}
                >
                  Keep request
                </button>
              </div>
            </section>
          )}
          {canStartAgain && (
            <a
              href={`/try-on?product=${job.productId}`}
              className="primary-button full-width"
            >
              Try again with a new photo{" "}
              <span aria-hidden="true">
                <UiIcon kind="up-right" />
              </span>
            </a>
          )}
          {currentProduct.data?.status === "PUBLISHED" &&
          currentProduct.data.availability === "AVAILABLE" ? (
            <a
              className="secondary-button full-width"
              href={`/callback?product=${job.productId}`}
            >
              Request a store callback <UiIcon />
            </a>
          ) : (
            <p className="form-hint">
              {currentProduct.loading
                ? "Checking current product availability…"
                : "A new callback is unavailable for this listing. Existing enquiries remain in your account."}
            </p>
          )}
          <a className="text-button" href="/account/enquiries">
            My enquiries <UiIcon />
          </a>
          <a className="text-button" href={`/products/${job.productId}`}>
            View current product details <UiIcon kind="up-right" />
          </a>
          <button
            className="text-button"
            type="button"
            onClick={request.refresh}
            disabled={busy !== null}
          >
            Refresh request status
          </button>
          <p className="preview-privacy">
            This request stays in your personal account. Store teams cannot view
            your photo or result. Saved previews remain yours even if the
            product is archived.
          </p>
        </aside>
      </div>
      {!job.demo && (
        <p className="ai-limitations">
          AI-generated preview. Appearance, garment details and drape may
          differ. This is not a size or fit guarantee.
        </p>
      )}
    </main>
  );
}
