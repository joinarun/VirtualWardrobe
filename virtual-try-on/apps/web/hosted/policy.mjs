import { lstat, readFile, mkdir, open, rename, unlink } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export const TARGET = Object.freeze({
  project: "virtualtryon-511016",
  origin: "https://virtualwardrobe-511016.web.app",
  bucket: "virtualtryon-511016-virtualwardrobe-demo-private",
  model: "gemini-nano-banana-2.1",
});
export const PROFILE = Object.freeze({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  cpuSlowdown: 4,
  downloadMbps: 9,
  uploadMbps: 1.6,
  latencyMs: 150,
  cache: "disabled",
});
export class SafeFailure extends Error {
  constructor(code) {
    const safe = /^[A-Z0-9_]{1,80}$/.test(code) ? code : "UNEXPECTED_FAILURE";
    super(safe);
    this.code = safe;
  }
}
export function requireCheck(condition, code) {
  if (!condition) throw new SafeFailure(code);
}
export function assertSafeEnvironment(environment) {
  const unsafe = new Set([
    "DEBUG",
    "DEBUG_FILE",
    "PWDEBUG",
    "NODE_DEBUG",
    "NODE_DEBUG_NATIVE",
    "NODE_OPTIONS",
    "CHROME_LOG_FILE",
  ]);
  requireCheck(
    !Object.entries(environment).some(
      ([key, value]) =>
        value &&
        (unsafe.has(key) || /^(PW|PLAYWRIGHT).*?(DEBUG|TRACE|HAR)/.test(key)),
    ),
    "UNSAFE_DEBUG_ENVIRONMENT",
  );
}
export function targetInventory(value) {
  requireCheck(
    value?.project_id === TARGET.project &&
      value.web_url === TARGET.origin &&
      value.resources?.private_bucket === TARGET.bucket &&
      value.environment === "demo" &&
      value.region === "asia-south1" &&
      /^[a-f0-9]{40}$/.test(value.source_revision || ""),
    "WRONG_HOSTED_TARGET",
  );
  try {
    const api = new URL(value.api_url);
    requireCheck(
      api.protocol === "https:" &&
        !api.port &&
        api.hostname.startsWith("virtualwardrobe-demo-api-") &&
        api.hostname.endsWith(".run.app") &&
        api.pathname === "/" &&
        !api.search &&
        !api.hash &&
        !api.username &&
        !api.password,
      "WRONG_HOSTED_TARGET",
    );
  } catch {
    throw new SafeFailure("WRONG_HOSTED_TARGET");
  }
  return value;
}
export async function jsonFile(path, protectedFile = false) {
  try {
    const info = await lstat(path);
    requireCheck(
      info.isFile() &&
        !info.isSymbolicLink() &&
        info.size <= 131072 &&
        (!protectedFile || ((info.mode & 0o777) === 0o600 && info.nlink === 1)),
      "UNSAFE_INPUT_FILE",
    );
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof SafeFailure) throw error;
    throw new SafeFailure("INPUT_FILE_UNAVAILABLE");
  }
}
export function credentialBundle(value) {
  requireCheck(
    value?.schemaVersion === 1 &&
      value.profile === "standard" &&
      Array.isArray(value.users) &&
      value.users.length >= 12,
    "INVALID_CREDENTIAL_BUNDLE",
  );
  for (const user of value.users)
    requireCheck(
      typeof user.id === "string" &&
        ["CUSTOMER", "WORKFORCE"].includes(user.kind) &&
        typeof user.identifier === "string" &&
        typeof user.password === "string" &&
        user.password.length >= 12 &&
        typeof user.name === "string" &&
        Array.isArray(user.storeIds),
      "INVALID_CREDENTIAL_BUNDLE",
    );
  return value;
}
export function actors(bundle) {
  const customers = bundle.users.filter(
    (user) => user.role === "CUSTOMER" && user.kind === "CUSTOMER",
  );
  const staff = bundle.users.filter(
    (user) => user.role === "STAFF" && user.kind === "WORKFORCE",
  );
  for (const store of new Set(staff.flatMap((user) => user.storeIds))) {
    const shared = staff.filter((user) => user.storeIds.includes(store));
    const foreign = staff.find((user) => !user.storeIds.includes(store));
    if (shared.length >= 2 && foreign && customers.length >= 2)
      return {
        customer: customers[0],
        other: customers[1],
        staff: shared[0],
        teammate: shared[1],
        foreign,
        store,
      };
  }
  throw new SafeFailure("SHARED_STAFF_STORE_UNAVAILABLE");
}
export function safePrivatePath(value) {
  try {
    const url = new URL(value, TARGET.origin);
    requireCheck(
      url.origin === TARGET.origin &&
        !url.username &&
        !url.password &&
        !url.hash &&
        /^\/api\/v1\/private-media\/[a-f0-9-]{36}\/(content|download)$/.test(
          url.pathname,
        ) &&
        !url.search,
      "INVALID_PRIVATE_PATH",
    );
    return url.pathname;
  } catch (error) {
    if (error instanceof SafeFailure) throw error;
    throw new SafeFailure("INVALID_PRIVATE_PATH");
  }
}
export function uploadCapability(value, expectedBytes, mime) {
  try {
    const url = new URL(value.uploadUrl);
    requireCheck(
      url.protocol === "https:" &&
        url.hostname === "storage.googleapis.com" &&
        url.pathname.startsWith(`/${TARGET.bucket}/`) &&
        !url.username &&
        !url.password &&
        !url.hash &&
        /^[a-f0-9-]{36}$/.test(value.uploadId || "") &&
        value.method === "PUT" &&
        url.searchParams.has("X-Goog-Signature") &&
        Number(url.searchParams.get("X-Goog-Expires")) > 0 &&
        Number(url.searchParams.get("X-Goog-Expires")) <= 300 &&
        Number.isSafeInteger(expectedBytes) &&
        expectedBytes > 0 &&
        value.headers?.["Content-Type"] === mime &&
        value.headers?.["x-goog-if-generation-match"] === "0" &&
        /private/.test(value.headers?.["Cache-Control"] || "") &&
        /no-store/.test(value.headers?.["Cache-Control"] || ""),
      "INVALID_UPLOAD_CAPABILITY",
    );
    const signed = url.searchParams.get("X-Goog-SignedHeaders") || "";
    requireCheck(
      [
        "content-length",
        "content-type",
        "cache-control",
        "x-goog-if-generation-match",
      ].every((header) => signed.split(";").includes(header)),
      "INVALID_UPLOAD_CAPABILITY",
    );
    requireCheck(
      Object.keys(value.headers).every((header) =>
        [
          "content-type",
          "cache-control",
          "x-goog-if-generation-match",
        ].includes(header.toLowerCase()),
      ),
      "INVALID_UPLOAD_CAPABILITY",
    );
    return value;
  } catch (error) {
    if (error instanceof SafeFailure) throw error;
    throw new SafeFailure("INVALID_UPLOAD_CAPABILITY");
  }
}
export async function privateDirectory(path) {
  try {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const info = await lstat(path);
    requireCheck(
      info.isDirectory() && !info.isSymbolicLink() && (info.mode & 0o077) === 0,
      "UNSAFE_OUTPUT_DIRECTORY",
    );
  } catch (error) {
    if (error instanceof SafeFailure) throw error;
    throw new SafeFailure("UNSAFE_OUTPUT_DIRECTORY");
  }
}
export async function writePrivate(path, value, exclusive = false) {
  const bytes = JSON.stringify(value, null, 2) + "\n";
  const temp = exclusive ? path : join(dirname(path), `.${randomUUID()}.tmp`);
  let file;
  try {
    file = await open(temp, "wx", 0o600);
    await file.writeFile(bytes);
    await file.sync();
    await file.close();
    file = null;
    if (!exclusive) await rename(temp, path);
    const parent = await open(dirname(path), "r");
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  } catch (error) {
    if (file) await file.close().catch(() => {});
    if (!exclusive) await unlink(temp).catch(() => {});
    throw new SafeFailure(
      error?.code === "EEXIST"
        ? "ATTEMPT_JOURNAL_ALREADY_EXISTS"
        : "PRIVATE_FILE_DURABILITY_FAILED",
    );
  }
}
export function fixedStateDirectory(requested, canonical) {
  requireCheck(
    resolve(requested) === resolve(canonical),
    "NONCANONICAL_STATE_DIRECTORY",
  );
  return resolve(canonical);
}
export function signupRecovery(status, payload, phone) {
  if (![200, 201].includes(status)) return null;
  requireCheck(
    payload?.user?.kind === "CUSTOMER" &&
      payload.user.phone === phone &&
      Array.isArray(payload.recoveryCodes) &&
      payload.recoveryCodes.length > 0 &&
      payload.recoveryCodes.every((code) => typeof code === "string"),
    "SIGNUP_IDENTITY_OR_RECOVERY_NOT_CONFIRMED",
  );
  return payload.recoveryCodes;
}
export function terminalObservation(
  job,
  journal,
  observed,
  pollStarted,
  now = Date.now(),
) {
  const states = [
    "QUEUED",
    "RUNNING",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
  ];
  const terminal = states.slice(2).includes(job?.state);
  const created = Date.parse(job?.createdAt),
    updated = Date.parse(job?.updatedAt);
  return {
    observedStates: [...observed].filter((state) => states.includes(state)),
    terminal: terminal ? job.state : "NOT_TERMINAL",
    terminalObservedAt: new Date(now).toISOString(),
    pollToTerminalMs: now - pollStarted,
    serverCreatedAt: Number.isFinite(created)
      ? new Date(created).toISOString()
      : null,
    serverTerminalUpdatedAt:
      terminal && Number.isFinite(updated)
        ? new Date(updated).toISOString()
        : null,
    serverJobCompletionMs:
      terminal && Number.isFinite(created) && Number.isFinite(updated)
        ? updated - created
        : null,
    actionReservationToTerminalMs: now - Date.parse(journal.createdAt),
    attempts:
      Number.isSafeInteger(job?.attempts) && job.attempts >= 0
        ? job.attempts
        : null,
    estimatedUsageUsd: null,
    usageEvidence: "NOT_EXPOSED_IN_JOB_DTO",
  };
}
export async function reserveLiveAction(directory, revision) {
  await privateDirectory(directory);
  const path = join(directory, "hosted-live-job.json");
  const value = {
    schemaVersion: 1,
    project: TARGET.project,
    revision,
    state: "SUBMISSION_RESERVED",
    createdAt: new Date().toISOString(),
    jobId: null,
  };
  await writePrivate(path, value, true);
  return { path, value };
}
export function safeFailure(error) {
  return error instanceof SafeFailure
    ? error.code
    : "HOSTED_VERIFICATION_FAILED";
}

export function safeActivity(slot, stage) {
  requireCheck(
    ["GENERAL", "CUSTOMER", "OTHER", "STAFF", "TEAMMATE", "FOREIGN"].includes(
      slot,
    ) && /^[A-Z0-9_]{1,80}$/.test(stage),
    "UNSAFE_ACTIVITY_METADATA",
  );
  return { slot, stage };
}
