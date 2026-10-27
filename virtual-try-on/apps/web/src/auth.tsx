import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError, advanceAuthSession, errorMessage, refreshCsrf, sessionGeneration } from "./api";
import type { AuthConfig, User } from "./types";
import { AuthContext } from "./auth-context";

function checkedSession(value: unknown): User | null {
  if (value && typeof value === "object" && Object.hasOwn(value, "user")) {
    const user = (value as { user: unknown }).user;
    if (user === null) return null;
    if (user && typeof user === "object") {
      const candidate = user as User;
      if (typeof candidate.id === "string" && typeof candidate.name === "string" &&
        ["CUSTOMER", "WORKFORCE"].includes(candidate.kind) && Array.isArray(candidate.memberships) &&
        typeof candidate.enabled === "boolean" && typeof candidate.superAdmin === "boolean" &&
        typeof candidate.passwordChangeRequired === "boolean") return candidate;
    }
  }
  throw new ApiError({ code: "SESSION_RESPONSE_INVALID", detail: "We couldn't check your session. Please try again." }, 502);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<"unknown" | "authenticated" | "guest">("unknown");
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const account = useRef<User | null>(null);
  const known = useRef<typeof status>("unknown");
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<Promise<User | null> | null>(null);
  const configController = useRef<AbortController | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const accept = useCallback((next: User | null) => {
    account.current = next;
    known.current = next ? "authenticated" : "guest";
    setUser(next);
    setStatus(known.current);
  }, []);
  const invalidateRead = useCallback(() => {
    epoch.current += 1;
    controller.current?.abort();
    controller.current = null;
    pending.current = null;
  }, []);
  const refreshUser = useCallback(() => {
    if (pending.current) return pending.current;
    const generation = ++epoch.current;
    const abort = new AbortController();
    controller.current = abort;
    const current = () => generation === epoch.current && !abort.signal.aborted;
    const request = api<unknown>("/auth/session", { signal: abort.signal })
      .then((result) => {
        if (!current()) return account.current;
        const next = checkedSession(result);
        if (known.current !== "unknown" && account.current?.id !== next?.id)
          advanceAuthSession();
        accept(next);
        setError(null);
        return next;
      })
      .catch((failure) => {
        if (current() && !(failure instanceof ApiError && failure.code === "SESSION_CHANGED"))
          setError(errorMessage(failure));
        throw failure;
      })
      .finally(() => {
        if (generation === epoch.current) {
          pending.current = null;
          controller.current = null;
          setLoading(false);
        }
      });
    pending.current = request;
    return request;
  }, [accept]);
  const loadConfig = useCallback(() => {
    configController.current?.abort();
    const abort = new AbortController();
    configController.current = abort;
    return api<AuthConfig>("/auth/config", { signal: abort.signal }).then((next) => {
      if (!abort.signal.aborted) { setConfig(next); setConfigError(null); }
    }).catch((failure) => {
      if (!abort.signal.aborted) setConfigError(errorMessage(failure));
    }).finally(() => {
      if (!abort.signal.aborted) setConfigLoading(false);
    });
  }, []);
  const reload = useCallback(async () => {
    if (known.current === "unknown") setLoading(true);
    setError(null);
    setConfigError(null);
    setConfigLoading(true);
    invalidateRead();
    await Promise.allSettled([refreshUser(), loadConfig()]);
  }, [refreshUser, loadConfig, invalidateRead]);
  useEffect(() => {
    void refreshUser().catch(() => {});
    void loadConfig();
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    const resume = () => {
      if (document.hidden) return;
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        invalidateRead();
        void refreshUser().catch(() => {});
      }, 120);
    };
    const visibility = () => {
      if (document.hidden) invalidateRead();
      else resume();
    };
    const expired = (event: Event) => {
      const generation = (event as CustomEvent<{ generation: number }>).detail?.generation;
      if (generation !== undefined && generation !== sessionGeneration()) return;
      // A business401 may be stale or an edge failure; confirm with the session endpoint.
      resume();
    };
    try {
      channel.current = new BroadcastChannel("vw-account-change");
      channel.current.onmessage = resume;
    } catch { /* Focus/visibility still revalidates when messaging is unavailable. */ }
    document.addEventListener("visibilitychange", visibility);
    for (const name of ["focus", "pageshow", "online"]) window.addEventListener(name, resume);
    window.addEventListener("vw:session-expired", expired);
    return () => {
      invalidateRead();
      configController.current?.abort();
      clearTimeout(resumeTimer);
      document.removeEventListener("visibilitychange", visibility);
      for (const name of ["focus", "pageshow", "online"]) window.removeEventListener(name, resume);
      window.removeEventListener("vw:session-expired", expired);
      channel.current?.close();
      channel.current = null;
    };
  }, [loadConfig, refreshUser, invalidateRead]);
  const completeAuth = async (next: User) => {
    invalidateRead();
    advanceAuthSession();
    accept(next);
    setLoading(false);
    setError(null);
    channel.current?.postMessage("revalidate");
    const generation = sessionGeneration();
    try { await refreshCsrf(); }
    catch (failure) { if (generation === sessionGeneration()) setError(errorMessage(failure)); }
  };
  const logout = async () => {
    invalidateRead();
    await api<void>("/auth/logout", { method: "POST", body: {} });
    advanceAuthSession();
    accept(null);
    setLoading(false);
    setError(null);
    channel.current?.postMessage("revalidate");
  };
  return <AuthContext.Provider value={{ user, status, config, configLoading, loading, error, configError,
    reload, refreshUser, completeAuth, logout }}>{children}</AuthContext.Provider>;
}
