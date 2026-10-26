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
let csrfRequest: Promise<{ token: string; headerName: string }> | null = null;

export function clearCsrf() {
  csrf = null;
  csrfRequest = null;
}
export async function refreshCsrf() {
  clearCsrf();
  return getCsrf();
}
async function getCsrf() {
  if (csrf) return csrf;
  if (!csrfRequest)
    csrfRequest = fetch("/api/v1/auth/csrf", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new ApiError(
            {
              detail:
                "We could not secure this session. Please refresh and try again.",
            },
            response.status,
          );
        const result = (await response.json()) as {
          token: string;
          headerName: string;
        };
        if (!result.token || !result.headerName)
          throw new Error("Session security is not available. Please retry.");
        csrf = result;
        return result;
      })
      .finally(() => {
        csrfRequest = null;
      });
  return csrfRequest;
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  retryCsrf = true,
): Promise<T> {
  const method = options.method || "GET";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const security = await getCsrf();
    headers[security.headerName] = security.token;
  }
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: "include",
      cache: "no-store",
      signal: options.signal,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(
      {
        detail:
          "We could not reach the service. Check your connection and try again.",
      },
      0,
    );
  }
  if (!response.ok) {
    let problem: Problem = {};
    try {
      problem = (await response.json()) as Problem;
    } catch {
      /* A proxy error is not JSON. Keep a safe message. */
    }
    if (
      response.status === 403 &&
      problem.code?.includes("CSRF") &&
      retryCsrf
    ) {
      await refreshCsrf();
      return api<T>(path, options, false);
    }
    if (
      response.status === 401 &&
      !["/auth/login", "/auth/recover"].includes(path)
    )
      window.dispatchEvent(new Event("vw:session-expired"));
    throw new ApiError(problem, response.status);
  }
  if (
    response.status === 204 ||
    (response.status === 202 && response.headers.get("content-length") === "0")
  )
    return undefined as T;
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
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
