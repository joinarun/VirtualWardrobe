import type { Problem } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: Problem["fieldErrors"];
  constructor(problem: Problem, status: number) {
    super(
      problem.detail ||
        problem.title ||
        "Something went wrong. Please try again.",
    );
    this.name = "ApiError";
    this.status = status;
    this.code = problem.code || "REQUEST_FAILED";
    this.fieldErrors = problem.fieldErrors;
  }
}
let csrf: { token: string; headerName: string } | null = null;
let authGeneration = 0;
let csrfGeneration = 0;
let csrfRequest: {
  promise: Promise<{ token: string; headerName: string }>;
  abort: AbortController;
} | null = null;

export const sessionGeneration = () => authGeneration;
export function advanceAuthSession() {
  authGeneration += 1;
  clearCsrf();
}
function changedSession() {
  return new ApiError({ code: "SESSION_CHANGED", detail: "Your account changed. Please try this action again." }, 409);
}

// Bound reads, including the response body. A transport failure never means signed out.
async function transport(path: string, options: RequestInit) {
  const abort = new AbortController();
  const cancel = () => abort.abort();
  const external = options.signal;
  let timedOut = false;
  if (external?.aborted) throw new DOMException("Request cancelled", "AbortError");
  external?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; abort.abort(); }, 30000);
  try {
    const response = await fetch(path, { ...options, signal: abort.signal });
    return { response, text: await response.text() };
  } catch {
    if (external?.aborted) throw new DOMException("Request cancelled", "AbortError");
    throw new ApiError({
      code: timedOut ? "REQUEST_TIMEOUT" : "CONNECTION_UNAVAILABLE",
      detail: timedOut
        ? "The connection is taking longer than usual. Please try again."
        : "We could not reach the service. Check your connection and try again.",
    }, 0);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", cancel);
  }
}

export function clearCsrf() {
  csrfGeneration += 1;
  csrf = null;
  csrfRequest?.abort.abort();
  csrfRequest = null;
}
export async function refreshCsrf() {
  clearCsrf();
  return getCsrf();
}
async function getCsrf() {
  if (csrf) return csrf;
  if (!csrfRequest) {
    const generation = csrfGeneration;
    const abort = new AbortController();
    const pending = { abort, promise: Promise.resolve({ token: "", headerName: "" }) };
    pending.promise = transport("/api/v1/auth/csrf", {
      credentials: "include",
      cache: "no-store",
      signal: abort.signal,
    })
      .then(({ response, text }) => {
        if (generation !== csrfGeneration) throw changedSession();
        if (!response.ok)
          throw new ApiError(
            {
              detail:
                "We could not secure this session. Please refresh and try again.",
            },
            response.status,
          );
        let result: {
          token: string;
          headerName: string;
        };
        try { result = JSON.parse(text); }
        catch { throw new ApiError({ detail: "Session security is unavailable. Please try again." }, 502); }
        if (!result.token || !result.headerName)
          throw new Error("Session security is not available. Please retry.");
        csrf = result;
        return result;
      })
      .catch((failure) => {
        if (generation !== csrfGeneration) throw changedSession();
        throw failure;
      })
      .finally(() => {
        if (csrfRequest === pending) csrfRequest = null;
      });
    csrfRequest = pending;
  }
  return csrfRequest.promise;
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  retryCsrf = true,
): Promise<T> {
  const generation = authGeneration;
  const method = options.method || "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const security = await getCsrf();
    if (generation !== authGeneration) throw changedSession();
    headers[security.headerName] = security.token;
  }
  const { response, text } = await transport(`/api/v1${path}`, {
      method,
      headers,
      credentials: "include",
      cache: "no-store",
      signal: options.signal,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  if (generation !== authGeneration) throw changedSession();
  if (!response.ok) {
    let problem: Problem = {};
    try {
      problem = JSON.parse(text) as Problem;
    } catch {
      /* A proxy error is not JSON. Keep a safe message. */
    }
    if (
      response.status === 403 &&
      problem.code?.includes("CSRF") &&
      retryCsrf
    ) {
      await refreshCsrf();
      if (generation !== authGeneration) throw changedSession();
      return api<T>(path, options, false);
    }
    if (
      response.status === 401 &&
      !["/auth/session", "/auth/login", "/auth/recover", "/auth/signup"].includes(path)
    )
      window.dispatchEvent(new CustomEvent("vw:session-expired", { detail: { generation } }));
    throw new ApiError(problem, response.status);
  }
  if (
    response.status === 204 ||
    (response.status === 202 && response.headers.get("content-length") === "0")
  )
    return undefined as T;
  if (!text) return undefined as T;
  try { return JSON.parse(text) as T; }
  catch { throw new ApiError({ code: "RESPONSE_INVALID", detail: "We couldn't read the response. Please try again." }, 502); }
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
export function passwordError(password: string, minimum = 12) {
  if (password.length < minimum)
    return `Use at least ${minimum} characters for your password.`;
  if (new TextEncoder().encode(password).length > 72)
    return "This password is too long. Please use a shorter password.";
  return null;
}
