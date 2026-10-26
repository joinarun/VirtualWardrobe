import { UiIcon } from "./UiIcon";
import { useId, useState } from "react";
import { errorMessage } from "../api";
import { uploadMedia } from "../uploads";
import type { UploadProgress } from "../uploads";
import { Notice } from "./Common";
export function LogoUploader({
  label,
  url,
  authorizePath,
  onUploaded,
}: {
  label: string;
  url?: string;
  authorizePath: string;
  onUploaded: (url: string) => Promise<void> | void;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="logo-uploader">
      <div className="logo-preview">
        {url ? (
          <img src={url} alt={label} width={64} height={64} />
        ) : (
          <span aria-hidden="true">
            <UiIcon kind="sparkle" />
          </span>
        )}
      </div>
      <div>
        <label className="upload-file-label" htmlFor={id}>
          {label}
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setBusy(true);
              setError(null);
              try {
                const media = await uploadMedia(
                  file,
                  authorizePath,
                  setProgress,
                  true,
                );
                await onUploaded(
                  media.thumbnailUrl || `/api/v1/media/${media.id}/thumbnail`,
                );
              } catch (failure) {
                setError(errorMessage(failure));
              } finally {
                setBusy(false);
                setProgress(null);
              }
            }}
          />
        </label>
        <p className="form-hint">
          JPEG, PNG or WebP · up to 10 MB and 20 megapixels. Use an image you
          have permission to publish.
        </p>
        {progress && (
          <p className="upload-progress" role="status">
            {progress.phase === "validating"
              ? "Checking and preparing the image…"
              : `Uploading ${progress.percent}%`}
          </p>
        )}
        {error && <Notice>{error}</Notice>}
      </div>
    </div>
  );
}
