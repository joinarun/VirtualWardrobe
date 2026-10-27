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
import { previewFailure } from "../tryon-types";
import { putAuthorizedFile } from "../uploads";
import type { UploadProgress } from "../uploads";
import { useUnsavedChanges } from "../navigation";

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
  const [busy, setBusy] = useState<
    "uploading" | "validating" | "creating" | "discarding" | null
  >(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<SourceUpload | null>(null);
  const [pendingFinalize, setPendingFinalize] = useState<string | null>(null);
  const [retainedUploadId, setRetainedUploadId] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIntentKey());
  const allowLeave = useUnsavedChanges(Boolean(photo));
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );
  useEffect(() => {
    if (!photo || !window.matchMedia("(max-width: 767px)").matches) return;
    const frame = requestAnimationFrame(() => document.querySelector(".person-photo-zone")?.scrollIntoView({
      block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    }));
    return () => cancelAnimationFrame(frame);
  }, [photo]);
  const config = configRequest.data,
    product = productRequest.data,
    quota = quotaRequest.data;
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
    setSource(null);
    setPendingFinalize(null);
    setIdempotencyKey(newIntentKey());
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!config || !product || !photo || config.processingRequest?.action !== "TRY_ON") {
      setError(
        "Choose a photo to create your preview.",
      );
      return;
    }
    if (!config.enabled) {
      setError("Previews are temporarily unavailable. Please try again later.");
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
                processingRequest: config.processingRequest,
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
      allowLeave();
      window.location.assign(`/account/previews/${job.id}`);
    } catch (failure) {
      setError(previewFailure(failure));
      if (failure instanceof ApiError && failure.code === "CONSENT_UPDATED") {
        setSource(null);
        setPendingFinalize(null);
        setIdempotencyKey(newIntentKey());
        setRevision((value) => value + 1);
      }
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
  return (
    <main className="tryon-page mobile-photo-page">
      <nav className="preview-breadcrumbs"><a href={`/products/${product.id}`}><UiIcon kind="left" />Back to saree</a><a href="/account/previews">My previews</a></nav>
      <ol className="preview-steps" aria-label="Preview steps">
        <li className="done"><span>1</span>Choose a saree</li>
        <li aria-current="step"><span>2</span>Add your photo</li>
        <li><span>3</span>View your preview</li>
      </ol>
      <header className="tryon-title"><p className="eyebrow">MAKE IT YOURS</p><h1>See yourself in it.</h1><p>Add a full-length photo. We'll take it from here.</p></header>
      <div className="tryon-layout">
        <aside className="tryon-product-card">
          {product.coverUrl && <img src={product.coverUrl} alt={product.title} width={320} height={480} />}
          <div><p className="eyebrow">{product.brandName || product.storeName}</p><h2>{product.title}</h2><strong>{rupees(product.price)}</strong><p>{[product.fabric, product.colour].filter(Boolean).join(" · ")}</p></div>
        </aside>
        <div className="tryon-form-column">
          {!available && <Notice tone="info">Previews are currently unavailable for this saree. Choose another from the collection.</Notice>}
          {quota.remaining === 0 && <Notice tone="info">You've used today's previews. Your saved and recent previews are still here.</Notice>}
          <form onSubmit={(event) => void submit(event)}>
            <fieldset className="tryon-fields" disabled={busy !== null || !available}>
              <section className="panel photo-step">
                <h2>Your photo</h2><p className="photo-intro">A clear, full-length photo works best.</p>
                <div className="photo-choose-row">
                  <label className="upload-file-label"><UiIcon kind="image" />{photo ? "Choose another photo" : "Choose a photo"}<input type="file" accept="image/jpeg,image/png" onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = ""; }} /></label>
                  <label className="upload-file-label"><UiIcon kind="camera" />Take a photo<input type="file" accept="image/jpeg,image/png" capture="environment" onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = ""; }} /></label>
                </div>
                <div className={`person-photo-zone ${photo ? "has-photo" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void choose(event.dataTransfer.files[0]); }}>
                  {photo ? <img src={photo.url} alt="Your selected photo, shown locally before upload" /> : <div className="photo-silhouette" aria-hidden="true"><svg viewBox="0 0 140 220"><circle cx="70" cy="34" r="17" /><path d="M50 60Q70 52 90 60L105 123 91 127 81 91 84 146 89 202 73 202 69 154 65 202 49 202 55 146 58 91 47 127 34 123Z" /><path className="frame-guide" d="M20 40V12H48M92 12H120V40M120 180V212H92M48 212H20V180" /></svg><p>A little space for you</p></div>}
                </div>
                <p className="form-hint">JPG or PNG, up to 10 MB.</p>
              </section>
            </fieldset>
            {(retainedUploadId || source || pendingFinalize) && <button className="text-button danger-text service-refresh" type="button" disabled={busy !== null} onClick={async () => { setBusy("discarding"); setError(null); try { await discardUnused(); setPhoto(null); setIdempotencyKey(newIntentKey()); } catch (failure) { setError(previewFailure(failure)); } finally { setBusy(null); } }}>Remove uploaded photo</button>}
            {error && <Notice>{error}</Notice>}
            {progress && <div className="private-upload-progress" role="status"><span>{progress.phase === "validating" ? "Preparing your photo…" : `Uploading your photo · ${progress.percent}%`}</span>{progress.phase === "uploading" && <progress max={100} value={progress.percent} />}</div>}
            <div className={`photo-submit mobile-action-bar ${photo ? "has-photo" : ""}`}>
              <button className="primary-button full-width" type="submit" disabled={busy !== null || !available || quota.remaining <= 0 || !photo}>
                {busy === "uploading" ? "Uploading your photo…" : busy === "validating" ? "Preparing your photo…" : busy === "discarding" ? "Removing photo…" : busy === "creating" ? "Creating your preview…" : source ? "Retry creating preview" : "Create my preview"}<UiIcon kind="sparkle" />
              </button>
              <a href="/privacy" className="privacy-link">Privacy</a>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
