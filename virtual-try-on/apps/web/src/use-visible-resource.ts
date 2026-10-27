import { useEffect, useRef, useState } from "react";
import { api, ApiError, errorMessage } from "./api";
export function useVisibleResource<T>(
  path: string | null,
  { method = "GET", body, interval = 30000 }: { method?: string; body?: unknown; interval?: number } = {},
  externalRevision = 0,
) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const key = `${method}:${path}:${payload || ""}`;
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{ key: string; data: T | null; error: string | null } | null>(null);
  const epoch = useRef(0);
  useEffect(() => {
    if (!path) return;
    const generation = ++epoch.current;
    let stopped = false, serial = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: AbortController | null = null;
    const current = () => !stopped && epoch.current === generation;
    const load = async () => {
      if (!current() || document.hidden) return;
      active?.abort();
      const request = ++serial;
      const abort = new AbortController();
      active = abort;
      const latest = () => current() && request === serial && !abort.signal.aborted;
      try {
        const data = await api<T>(path, { method,
          body: payload === undefined ? undefined : JSON.parse(payload), signal: abort.signal });
        if (latest()) setResponse({ key, data, error: null });
      } catch (error) {
        if (latest() && !(error instanceof Error && error.name === "AbortError"))
          setResponse((previous) => ({ key, data:
            error instanceof ApiError && [401, 403, 404].includes(error.status) ? null
              : previous?.key === key ? previous.data : null, error: errorMessage(error) }));
      } finally {
        if (request === serial) active = null;
        if (latest()) timer = setTimeout(() => void load(), interval);
      }
    };
    const resume = () => {
      clearTimeout(timer);
      active?.abort();
      serial += 1;
      if (!document.hidden) timer = setTimeout(() => void load(), 120);
    };
    document.addEventListener("visibilitychange", resume);
    for (const name of ["focus", "pageshow", "online"]) window.addEventListener(name, resume);
    void load();
    return () => {
      stopped = true;
      active?.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      for (const name of ["focus", "pageshow", "online"]) window.removeEventListener(name, resume);
    };
  }, [path, method, payload, key, interval, revision, externalRevision]);
  const refresh = () => { epoch.current += 1; setRevision((value) => value + 1); };
  const replace = (data: T) => {
    epoch.current += 1;
    setResponse({ key, data, error: null });
    setRevision((value) => value + 1);
  };
  return { data: response?.key === key ? response.data : null,
    error: response?.key === key ? response.error : null,
    loading: Boolean(path) && response?.key !== key, refresh, replace };
}
