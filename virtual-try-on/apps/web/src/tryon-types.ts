import { ApiError, errorMessage } from "./api";
export type TryOnMode = "FIXTURE" | "EVALUATION_DEMO" | "LIVE";
export interface TryOnConfig {
  enabled: boolean;
  processingRequest: { version: string; action: "TRY_ON" };
  disabledReason: string | null;
  mode: TryOnMode;
  provider: string;
  model: string;
  location: string;
  label: string;
  notice: string;
  consent: {
    version: string;
    notice: string;
    providerPolicyUrl: string | null;
    sourceRetentionHours: number;
    unsavedRetentionHours: number;
    savedLimit: number;
    privateUrlSeconds: number;
    adultSelfOnly: boolean;
  };
  limits: {
    customerDaily: number;
    globalDaily: number;
    dailyBudgetUsd: string;
  };
}
export interface Quota {
  used: number;
  remaining: number;
  limit: number;
  resetsAt: string;
  saved: number;
  savedLimit: number;
}
export interface ProductSnapshot {
  id: string;
  title: string;
  sku: string;
  storeId: string;
  storeName: string;
  price: string;
  currency: "INR";
}
export type JobState =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";
export interface TryOnJob {
  id: string;
  productId: string;
  product: ProductSnapshot;
  state: JobState;
  createdAt: string;
  updatedAt: string;
  deadlineAt: string;
  attempts: number;
  provider: string;
  model: string;
  demo: boolean;
  evaluationDemo: boolean;
  label: string;
  notice: string;
  discarded: boolean;
  error: { code: string; message: string; canRetry: boolean } | null;
  result: {
    id: string;
    imageUrl: string;
    downloadUrl: string;
    expiresAt: string | null;
    saved: boolean;
    saving: boolean;
  } | null;
  canCancel: boolean;
  canSave: boolean;
  canDiscard: boolean;
}
export interface SavedPreview {
  id: string;
  jobId: string;
  product: ProductSnapshot;
  createdAt: string;
  provider: string;
  model: string;
  demo: boolean;
  evaluationDemo: boolean;
  label: string;
  notice: string;
  imageUrl: string;
  downloadUrl: string;
  currentAvailability: "AVAILABLE" | "UNAVAILABLE" | "ARCHIVED";
}
export interface SourceUpload {
  id: string;
  state: "VALIDATED";
  expiresAt: string;
}
export const activeJob = (job: TryOnJob) =>
  job.state === "QUEUED" ||
  job.state === "RUNNING" ||
  job.result?.saving === true;
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export function privatePath(value: string) {
  const destination = new URL(value, window.location.origin);
  if (
    destination.origin !== window.location.origin ||
    !destination.pathname.startsWith("/api/v1/private-media/")
  )
    throw Error(
      "The private image address is unavailable. Refresh this preview.",
    );
  return destination.pathname + destination.search;
}

export function previewFailure(failure: unknown) {
  if (failure instanceof ApiError && failure.code === "CONSENT_UPDATED")
    return "This step was updated. Please create your preview again.";
  const text = errorMessage(failure);
  return /provider|google|gemini|model|budget|benchmark|quality|evaluation|configuration|region|token|authorization/i.test(text)
    ? "We couldn't create this preview. Please try again later."
    : text;
}
