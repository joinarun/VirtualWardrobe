import { api, ApiError } from "./api";
import type { Media, UploadAuthorization } from "./catalog-types";
export type UploadProgress = {
  phase: "uploading" | "validating";
  percent: number;
};
export function validateFile(file: File, imagesOnly = false) {
  const image = ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (!image && (imagesOnly || file.type !== "video/mp4"))
    throw Error(
      imagesOnly
        ? "Choose a JPEG, PNG or WebP image."
        : "Choose JPEG, PNG, WebP or MP4 files.",
    );
  const maximum = (image ? 10 : 50) * 1024 * 1024;
  if (file.size > maximum)
    throw Error(
      `${file.name} exceeds the ${image ? "10 MB image" : "50 MB video"} limit.`,
    );
  if (file.size === 0)
    throw Error("This file is empty. Please choose another file.");
  return image ? ("IMAGE" as const) : ("VIDEO" as const);
}
export async function putAuthorizedFile(
  file: File,
  authorization: UploadAuthorization,
  onProgress: (progress: UploadProgress) => void,
) {
  const destination = new URL(authorization.uploadUrl, window.location.origin);
  if (
    destination.protocol !== "https:" &&
    destination.origin !== window.location.origin
  )
    throw Error("The upload address is not secure. Please retry.");
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(authorization.method, destination.href);
    request.withCredentials = false;
    request.timeout = 180000;
    // Only capability headers supplied by the server are used here. Never add the session CSRF header to storage requests.
    for (const [header, value] of Object.entries(authorization.headers))
      if (header.toLowerCase() !== "content-length")
        request.setRequestHeader(header, value);
    request.upload.onprogress = (event) =>
      onProgress({
        phase: "uploading",
        percent: event.lengthComputable
          ? Math.round((event.loaded / event.total) * 100)
          : 0,
      });
    request.onerror = () =>
      reject(
        new Error("The upload could not reach storage. Please try again."),
      );
    request.ontimeout = () =>
      reject(
        new Error(
          "The upload timed out. Please try again on a stable connection.",
        ),
      );
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else {
        let detail = "The upload was rejected. Please choose the file again.";
        try {
          detail = JSON.parse(request.responseText).detail || detail;
        } catch {
          /* Storage errors may be XML. */
        }
        reject(new ApiError({ detail }, request.status));
      }
    };
    onProgress({ phase: "uploading", percent: 0 });
    request.send(file);
  });
}
export async function uploadMedia(
  file: File,
  authorizePath: string,
  onProgress: (progress: UploadProgress) => void,
  imagesOnly = false,
): Promise<Media> {
  const kind = validateFile(file, imagesOnly);
  const authorization = await api<UploadAuthorization>(authorizePath, {
    method: "POST",
    body: {
      fileName: file.name,
      contentType: file.type,
      bytes: file.size,
      kind,
    },
  });
  await putAuthorizedFile(file, authorization, onProgress);
  onProgress({ phase: "validating", percent: 100 });
  const finalize = () =>
    api<{ media: Media }>(`/uploads/${authorization.uploadId}/finalize`, {
      method: "POST",
      body: {},
    });
  try {
    return (await finalize()).media;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 429) throw error;
    // The server keeps this upload reservation retryable when its decoder is busy.
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    return (await finalize()).media;
  }
}
