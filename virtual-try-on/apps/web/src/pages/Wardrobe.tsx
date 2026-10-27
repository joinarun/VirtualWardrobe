import { UiIcon } from "../components/UiIcon";
import { useState } from "react";
import { api } from "../api";
import { EmptyState, Loading, Notice } from "../components/Common";
import { checkedItems, useRemote } from "../remote";
import type { Page } from "../types";
import type { Quota, SavedPreview, TryOnJob } from "../tryon-types";
import { dateTime, privatePath, previewFailure } from "../tryon-types";

const statusLabels = { QUEUED: "Queued", RUNNING: "Creating", SUCCEEDED: "Ready", FAILED: "Not completed", EXPIRED: "Expired", CANCELLED: "Cancelled" };

function WardrobeNav({ gallery }: { gallery: boolean }) {
  return (
    <nav className="wardrobe-nav" aria-label="Your wardrobe">
      <a href="/account">Account</a>
      <a href="/account/previews" aria-current={!gallery ? "page" : undefined}>
        Recent previews
      </a>
      <a href="/account/gallery" aria-current={gallery ? "page" : undefined}>
        Saved gallery
      </a>
      <a href="/account/enquiries">My enquiries</a>
      <a href="/">
        Explore collection <UiIcon kind="up-right" />
      </a>
    </nav>
  );
}
function PrivateThumbnail({ url, title }: { url: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="wardrobe-image-error">
      This private preview could not load. Open the preview to retry.
    </span>
  ) : (
    <img
      src={privatePath(url)}
      alt={`Private preview of ${title}`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
export function WardrobePage({ gallery = false }: { gallery?: boolean }) {
  const [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const request = useRemote<Page<SavedPreview | TryOnJob>>(
    `/me/try-on/${gallery ? "gallery" : "jobs"}?page=${page}&size=12`,
    revision,
  );
  const quota = useRemote<Quota>("/me/try-on/quota", revision);
  const [removing, setRemoving] = useState<SavedPreview | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const items = checkedItems(request.data);
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      await api<void>(`/me/try-on/gallery/${removing.id}`, {
        method: "DELETE",
      });
      setRemoving(null);
      setMessage("Preview removed.");
      if (items.length === 1 && page > 0) setPage((v) => v - 1);
      setRevision((v) => v + 1);
    } catch (failure) {
      setError(previewFailure(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="wardrobe-page">
      <WardrobeNav gallery={gallery} />
      <header className="page-title-row">
        <div>
          <p className="eyebrow">YOUR PERSONAL SPACE</p>
          <h1>
            {gallery ? "A gallery that stays yours." : "Your recent previews."}
          </h1>
          <p>
            {gallery
              ? "Your saved previews, all in one place."
              : "Pick up where you left off."}
          </p>
        </div>
        {quota.data && (
          <span className="wardrobe-count">
            {gallery
              ? `${quota.data.saved} / ${quota.data.savedLimit} saved`
              : `${quota.data.remaining} / ${quota.data.limit} left today`}
          </span>
        )}
      </header>
      <button
        className="secondary-button"
        type="button"
        onClick={() => setRevision((value) => value + 1)}
      >
        Refresh {gallery ? "gallery" : "previews"}
      </button>
      {quota.error && (
        <Notice>
          We couldn't update your remaining previews.{" "}
          <button
            className="inline-button"
            type="button"
            onClick={() => setRevision((v) => v + 1)}
          >
            Refresh allowance
          </button>
        </Notice>
      )}
      {!gallery &&
        new URLSearchParams(window.location.search).get("notice") ===
          "discarded" && (
          <Notice tone="success">
            Request discarded.
          </Notice>
        )}
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {gallery && quota.data && quota.data.saved >= quota.data.savedLimit && (
        <Notice tone="info">
          Your saved gallery is full. Delete a preview before saving another;
          existing previews remain available.
        </Notice>
      )}
      {removing && (
        <section className="panel gallery-delete-confirm">
          <h2>Delete this saved preview?</h2>
          <p>{removing.product.title}</p>
          <p>
            This removes the preview from your saved gallery.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="danger-button"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Deleting…" : "Confirm gallery deletion"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              Keep saved preview
            </button>
          </div>
        </section>
      )}
      {request.loading ? (
        <Loading
          message={
            gallery ? "Opening your private gallery…" : "Finding your requests…"
          }
        />
      ) : request.error ? (
        <Notice>
          {previewFailure(new Error(request.error))}{" "}
          <button
            className="inline-button"
            type="button"
            onClick={() => setRevision((v) => v + 1)}
          >
            Retry private collection
          </button>
        </Notice>
      ) : !items.length ? (
        <section className="panel">
          <EmptyState
            title={
              gallery
                ? "Keep a little inspiration."
                : "Your next preview begins with a piece."
            }
          >
            {gallery
              ? "Save a preview to keep it here."
              : "Choose a saree, add a photo, and create your first preview."}
          </EmptyState>
          <a
            className="primary-button"
            href={gallery ? "/account/previews" : "/"}
          >
            {gallery ? "View recent previews" : "Find a piece to try"}
            <span aria-hidden="true">
              <UiIcon kind="up-right" />
            </span>
          </a>
        </section>
      ) : (
        <>
          <div
            className={`wardrobe-grid ${gallery ? "saved-preview-grid" : "recent-preview-grid"}`}
          >
            {items.map((item) => {
              const saved = gallery ? (item as SavedPreview) : null,
                job = gallery ? null : (item as TryOnJob);
              const image = saved?.imageUrl || job?.result?.imageUrl;
              const jobId = saved?.jobId || job!.id;
              const label = item.demo ? "Sample" : "Virtual preview";
              return (
                <article className="wardrobe-card" key={item.id}>
                  <a
                    className="wardrobe-image-link"
                    href={`/account/previews/${jobId}`}
                    aria-label={[
                      `Open preview of ${item.product.title}`,
                      [
                        !image
                          ? job?.discarded
                            ? "Removed"
                            : job && statusLabels[job.state]
                          : null,
                        label,
                      ]
                        .filter(Boolean)
                        .join(" "),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  >
                    {image ? (
                      <PrivateThumbnail
                        url={image}
                        title={item.product.title}
                      />
                    ) : (
                      <div className="wardrobe-job-placeholder">
                        <span aria-hidden="true">
                          <UiIcon
                            kind={
                              job?.state === "QUEUED" ||
                              job?.state === "RUNNING"
                                ? "clock"
                                : "sparkle"
                            }
                          />
                        </span>
                        <strong>
                          {job?.discarded ? "Removed" : job && statusLabels[job.state]}
                        </strong>
                      </div>
                    )}{" "}
                    <span className="wardrobe-image-label">{label}</span>
                  </a>
                  <div className="wardrobe-card-copy">
                    <p className="eyebrow">{item.product.storeName}</p>
                    <h2>
                      <a href={`/account/previews/${jobId}`}>
                        {item.product.title}
                      </a>
                    </h2>
                    <p>{dateTime(item.createdAt)}</p>
                    {job && (
                      <span
                        className={`preview-state state-${job.state.toLowerCase()}`}
                      >
                        {statusLabels[job.state]}
                        {job.discarded ? " · Removed" : ""}
                        {job.result?.saved
                          ? " · Saved"
                          : job.result?.saving
                            ? " · Saving"
                            : ""}
                      </span>
                    )}
                    {saved && saved.currentAvailability !== "AVAILABLE" && (
                      <p className="gallery-availability">
                        {saved.currentAvailability === "ARCHIVED"
                          ? "The product is archived. Your saved preview remains available."
                          : "The product is currently unavailable. Your preview remains yours."}
                      </p>
                    )}
                    <div className="wardrobe-card-actions">
                      <a
                        className="text-button"
                        href={`/account/previews/${jobId}`}
                      >
                        Open preview <UiIcon kind="up-right" />
                      </a>
                      {saved && (
                        <>
                          <a
                            className="text-button"
                            href={privatePath(saved.downloadUrl)}
                          >
                            Download
                          </a>
                          <button
                            className="text-button danger-text"
                            type="button"
                            disabled={busy}
                            aria-label={`Delete saved preview of ${item.product.title}`}
                            onClick={() => {
                              setRemoving(saved);
                              setError(null);
                              setMessage(null);
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
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
            <span>
              Page {page + 1} of{" "}
              {Math.max(1, Math.ceil((request.data?.total || 0) / 12))}
            </span>
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
      <p className="wardrobe-privacy">
        Your previews stay private. <a href="/privacy">Privacy</a>
      </p>
    </main>
  );
}
