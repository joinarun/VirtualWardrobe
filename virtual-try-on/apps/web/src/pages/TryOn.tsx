import { UiIcon } from "../components/UiIcon";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError, errorMessage } from "../api";
import { newIntentKey } from "../intent-key";
import type { Product, UploadAuthorization } from "../catalog-types";
import { rupees } from "../catalog-types";
import { Loading, Notice } from "../components/Common";
import { useRemote } from "../remote";
import type {
  Quota,
  SourceUpload,
  TryOnConfig,
  TryOnJob,
} from "../tryon-types";
import { dateTime } from "../tryon-types";
import { putAuthorizedFile } from "../uploads";
import type { UploadProgress } from "../uploads";

export function ProviderDisclosure({ config }: { config: TryOnConfig }) {
  return (
    <section
      className={`provider-disclosure mode-${config.mode.toLowerCase()}`}
      aria-label="AI service disclosure"
    >
      <span className="mode-label">{config.label}</span>
      <p>{config.notice}</p>
      <dl>
        <div>
          <dt>Provider</dt>
          <dd>{config.provider}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{config.model}</dd>
        </div>
        <div>
          <dt>Processing location</dt>
          <dd>{config.location}</dd>
        </div>
      </dl>
    </section>
  );
}
export function TryOnPage() {
  const productId =
    new URLSearchParams(window.location.search).get("product") || "";
  const [revision, setRevision] = useState(0);
  const configRequest = useRemote<TryOnConfig>("/try-on/config", revision);
  const productRequest = useRemote<Product>(
    productId ? `/products/${encodeURIComponent(productId)}` : null,
    revision,
  );
  const quotaRequest = useRemote<Quota>("/me/try-on/quota", revision);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [adult, setAdult] = useState(false);
  const [ownPhoto, setOwnPhoto] = useState(false);
  const [processingVersion, setProcessingVersion] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState<
    "uploading" | "validating" | "creating" | "discarding" | null
  >(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<SourceUpload | null>(null);
  const [pendingFinalize, setPendingFinalize] = useState<string | null>(null);
  const [retainedUploadId, setRetainedUploadId] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIntentKey());
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );
  const config = configRequest.data,
    product = productRequest.data,
    quota = quotaRequest.data;
  const processing =
    Boolean(config) && processingVersion === config?.consent.version;
  const discardUnused = async () => {
    const uploadId = source?.id || pendingFinalize || retainedUploadId;
    if (uploadId)
      await api<void>(`/me/try-on/uploads/${uploadId}`, { method: "DELETE" });
    setSource(null);
    setPendingFinalize(null);
    setRetainedUploadId(null);
  };
  const choose = async (file: File | undefined) => {
    if (!file || busy) return;
    setError(null);
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setError(
        "Choose a JPEG or PNG photo. WebP and other formats are not accepted for personal photos.",
      );
      return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError("Choose a non-empty JPEG or PNG photo up to 10 MB.");
      return;
    }
    if (source || pendingFinalize || retainedUploadId) {
      setBusy("discarding");
      try {
        await discardUnused();
      } catch (failure) {
        setError(errorMessage(failure));
        return;
      } finally {
        setBusy(null);
      }
    }
    setPhoto({ file, url: URL.createObjectURL(file) });
    setOwnPhoto(false);
    setProcessingVersion(null);
    setSource(null);
    setPendingFinalize(null);
    setIdempotencyKey(newIntentKey());
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!config || !product || !photo || !adult || !ownPhoto || !processing) {
      setError(
        "Choose your photo and complete all three consent confirmations before uploading.",
      );
      return;
    }
    if (!config.enabled) {
      setError(config.disabledReason || "Generation is currently unavailable.");
      return;
    }
    try {
      let validated = source;
      if (!validated) {
        let uploadId = pendingFinalize;
        if (!uploadId) {
          setBusy("uploading");
          if (retainedUploadId) await discardUnused();
          const authorization = await api<UploadAuthorization>(
            "/me/try-on/uploads",
            {
              method: "POST",
              body: {
                productId: product.id,
                fileName: photo.file.name,
                contentType: photo.file.type,
                bytes: photo.file.size,
                consent: {
                  version: config.consent.version,
                  adult: true,
                  ownPhoto: true,
                  providerProcessing: true,
                },
              },
            },
          );
          setRetainedUploadId(authorization.uploadId);
          await putAuthorizedFile(photo.file, authorization, setProgress);
          uploadId = authorization.uploadId;
          setPendingFinalize(uploadId);
        }
        setBusy("validating");
        setProgress({ phase: "validating", percent: 100 });
        const finalize = () =>
          api<{ source: SourceUpload }>(
            `/me/try-on/uploads/${uploadId}/finalize`,
            { method: "POST", body: {} },
          );
        let result;
        try {
          result = await finalize();
        } catch (failure) {
          if (!(failure instanceof ApiError) || failure.status !== 429)
            throw failure;
          await new Promise((resolve) => window.setTimeout(resolve, 1200));
          result = await finalize();
        }
        validated = result.source;
        setSource(validated);
        setPendingFinalize(null);
      }
      setBusy("creating");
      setProgress(null);
      const job = await api<TryOnJob>("/me/try-on/jobs", {
        method: "POST",
        body: {
          productId: product.id,
          sourceUploadId: validated.id,
          idempotencyKey,
        },
      });
      window.location.assign(`/account/previews/${job.id}`);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(null);
      setProgress(null);
    }
  };
  if (configRequest.loading || productRequest.loading || quotaRequest.loading)
    return <Loading message="Preparing your private preview space…" />;
  if (!productId)
    return (
      <main className="account-page">
        <section className="form-card">
          <h1>Start with a piece you love.</h1>
          <p className="form-intro">
            Choose a product from the collection, then select Try it on me.
          </p>
          <a className="primary-button" href="/">
            Explore the collection
          </a>
        </section>
      </main>
    );
  const loadError =
    configRequest.error || productRequest.error || quotaRequest.error;
  if (loadError || !config || !product || !quota)
    return (
      <main className="account-page">
        <section className="form-card">
          <h1>This preview is not ready.</h1>
          <Notice>
            {loadError || "The service configuration is unavailable."}
          </Notice>
          <div className="button-row">
            <button
              className="secondary-button"
              onClick={() => setRevision((v) => v + 1)}
              type="button"
            >
              Retry connection
            </button>
            <a className="text-button" href="/">
              Back to the collection
            </a>
          </div>
        </section>
      </main>
    );
  const available =
    config.enabled &&
    product.status === "PUBLISHED" &&
    product.availability === "AVAILABLE" &&
    product.tryOnEnabled;
  const consented = adult && ownPhoto && processing;
  return (
    <main className="tryon-page">
      <nav className="preview-breadcrumbs">
        <a href={`/products/${product.id}`}>
          <UiIcon kind="left" /> Product details
        </a>
        <a href="/account/previews">
          My previews <UiIcon kind="up-right" />
        </a>
      </nav>
      <header className="tryon-title">
        <p className="eyebrow">A LITTLE MORE PERSONAL</p>
        <h1>Picture this piece, your way.</h1>
        <p>
          A private space to upload your own full-body photo and explore a
          visual preview.
        </p>
      </header>
      <div className="tryon-layout">
        <aside className="tryon-product-card">
          {product.coverUrl && (
            <img
              src={product.coverUrl}
              alt={product.title}
              width={320}
              height={480}
            />
          )}
          <p className="eyebrow">{product.brandName || product.storeName}</p>
          <h2>{product.title}</h2>
          <strong>{rupees(product.price)}</strong>
          <p>{[product.fabric, product.colour].filter(Boolean).join(" · ")}</p>
          <a href={`/products/${product.id}`} className="text-button">
            Explore this piece <UiIcon kind="up-right" />
          </a>
          <div className="private-note">
            <span aria-hidden="true">
              <UiIcon kind="lock" />
            </span>
            <p>
              Your source photo and previews are private to your customer
              account. Store teams cannot view them.
            </p>
          </div>
        </aside>
        <div className="tryon-form-column">
          <ProviderDisclosure config={config} />
          {!available && (
            <Notice tone="info">
              {!config.enabled
                ? config.disabledReason || "Generation is currently paused."
                : "Try-on is unavailable for this product. Choose another available, try-on-enabled piece."}
            </Notice>
          )}
          <section className="quota-note" aria-label="Your daily allowance">
            <span>
              <strong>{quota.remaining}</strong> / {quota.limit} previews
              remaining today
            </span>
            <small>Resets {dateTime(quota.resetsAt)} (UTC daily reset)</small>
            <a href="/account/previews">View recent requests</a>
          </section>
          {quota.remaining === 0 && (
            <Notice tone="info">
              Your daily allowance is used. You can still view, download and
              manage existing previews.
            </Notice>
          )}
          <form onSubmit={(event) => void submit(event)}>
            <fieldset
              className="tryon-fields"
              disabled={busy !== null || !available}
            >
              <section className="panel photo-step">
                <p className="eyebrow">01 / YOUR PHOTO</p>
                <h2>A clear view makes a difference.</h2>
                <ul className="photo-guidance">
                  <li>
                    One adult, front-facing, with your full body in the frame.
                  </li>
                  <li>
                    Good lighting, a simple background and an unobstructed
                    outfit.
                  </li>
                  <li>
                    Your own photo only. No children's or third-party photos.
                  </li>
                </ul>
                <div
                  className={`person-photo-zone ${photo ? "has-photo" : ""}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    choose(event.dataTransfer.files[0]);
                  }}
                >
                  {photo ? (
                    <img
                      src={photo.url}
                      alt="Your selected photo, shown locally before upload"
                    />
                  ) : (
                    <div className="photo-silhouette" aria-hidden="true">
                      <svg viewBox="0 0 140 220">
                        <circle cx="70" cy="34" r="17" />
                        <path d="M50 60Q70 52 90 60L105 123 91 127 81 91 84 146 89 202 73 202 69 154 65 202 49 202 55 146 58 91 47 127 34 123Z" />
                        <path
                          className="frame-guide"
                          d="M20 40V12H48M92 12H120V40M120 180V212H92M48 212H20V180"
                        />
                      </svg>
                      <p>Your full-body photo goes here</p>
                    </div>
                  )}
                </div>
                <div className="photo-choose-row">
                  <label className="upload-file-label">
                    {photo ? "Choose another photo" : "Choose a photo"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={(event) => {
                        choose(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <label className="upload-file-label">
                    Take a photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      capture="environment"
                      onChange={(event) => {
                        choose(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <p className="form-hint">
                  JPEG or PNG · up to 10 MB and 20 megapixels. Camera capture
                  depends on your browser. Choosing a file shows it locally;
                  upload begins only after your consent and submission.
                </p>
                {photo && (
                  <p className="selected-photo-name">
                    {photo.file.name} ·{" "}
                    {(photo.file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                )}
              </section>
              <section className="panel consent-step">
                <p className="eyebrow">02 / YOUR CHOICE</p>
                <h2>Read this before uploading.</h2>
                <p className="consent-notice">{config.consent.notice}</p>
                {config.consent.providerPolicyUrl && (
                  <a
                    href={config.consent.providerPolicyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-button"
                  >
                    Read the provider's data policy <UiIcon kind="up-right" />
                  </a>
                )}
                <div className="retention-facts">
                  <span>
                    Source photos: up to {config.consent.sourceRetentionHours}{" "}
                    hours, removed after processing.
                  </span>
                  <span>
                    Unsaved previews: up to{" "}
                    {config.consent.unsavedRetentionHours} hours.
                  </span>
                  <span>
                    Saved previews: until you delete them, up to{" "}
                    {config.consent.savedLimit}.
                  </span>
                </div>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={adult}
                    onChange={(event) => setAdult(event.target.checked)}
                    required
                  />
                  <span>I am an adult (18 or older).</span>
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={ownPhoto}
                    onChange={(event) => setOwnPhoto(event.target.checked)}
                    required
                  />
                  <span>This is my own photo, and it shows only me.</span>
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={processing}
                    onChange={(event) =>
                      setProcessingVersion(
                        event.target.checked ? config.consent.version : null,
                      )
                    }
                    required
                  />
                  <span>
                    I consent to the processing and retention described above by{" "}
                    {config.provider} using {config.model}.
                  </span>
                </label>
                <p className="consent-version">
                  Disclosure version: {config.consent.version}
                </p>
              </section>
            </fieldset>
            {(retainedUploadId || source || pendingFinalize) && (
              <button
                className="text-button danger-text service-refresh"
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy("discarding");
                  setError(null);
                  try {
                    await discardUnused();
                    setPhoto(null);
                    setOwnPhoto(false);
                    setProcessingVersion(null);
                    setIdempotencyKey(newIntentKey());
                  } catch (failure) {
                    setError(errorMessage(failure));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Discard uploaded photo
              </button>
            )}
            <button
              className="text-button service-refresh"
              type="button"
              disabled={busy !== null}
              onClick={() => setRevision((value) => value + 1)}
            >
              Refresh service details and allowance
            </button>
            {error && (
              <Notice>
                {error}
                {source && (
                  <p>
                    Your validated upload is ready. Retrying this submission
                    keeps the same request key; it does not deliberately request
                    a second generation.
                  </p>
                )}
              </Notice>
            )}
            {progress && (
              <div className="private-upload-progress" role="status">
                <span>
                  {progress.phase === "validating"
                    ? "Checking and preparing your photo…"
                    : `Uploading your photo · ${progress.percent}%`}
                </span>
                {progress.phase === "uploading" && (
                  <progress max={100} value={progress.percent} />
                )}
              </div>
            )}
            <button
              className="primary-button full-width"
              type="submit"
              disabled={
                busy !== null ||
                !available ||
                quota.remaining <= 0 ||
                !photo ||
                !consented
              }
            >
              {busy === "uploading"
                ? "Uploading your photo…"
                : busy === "validating"
                  ? "Checking your photo…"
                  : busy === "discarding"
                    ? "Removing unused photo…"
                    : busy === "creating"
                      ? "Creating your request…"
                      : source
                        ? "Retry creating preview"
                        : config.mode === "FIXTURE"
                          ? "Create a demo preview"
                          : "Create my AI preview"}
              <span aria-hidden="true">
                <UiIcon kind="sparkle" />
              </span>
            </button>
            <p className="generation-note">
              {config.mode === "FIXTURE"
                ? "This local fixture is a demonstration, not an actual generated try-on."
                : "AI-generated preview. Appearance, garment details and drape may differ. This is not a size or fit guarantee."}{" "}
              You can leave and return to the request after it is created.
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
