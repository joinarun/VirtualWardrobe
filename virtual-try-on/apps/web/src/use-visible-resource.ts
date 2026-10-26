import { useEffect, useRef, useState } from "react";
import { api, ApiError, errorMessage } from "./api";
export function useVisibleResource<T>(
  path: string | null,
  {
    method = "GET",
    body,
    interval = 30000,
  }: { method?: string; body?: unknown; interval?: number } = {},
  externalRevision = 0,
) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const key = `${method}:${path}:${payload || ""}`;
  const [revision, setRevision] = useState(0),
    [response, setResponse] = useState<{
      key: string;
      data: T | null;
      error: string | null;
    } | null>(null);
  const epoch = useRef(0);
  useEffect(() => {
    if (!path) return;
    const generation = ++epoch.current;
    const abort = new AbortController();
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      inFlight = false;
    const current = () => !stopped && epoch.current === generation;
    const load = async () => {
      if (!current() || inFlight) return;
      inFlight = true;
      try {
        const data = await api<T>(path, {
          method,
          body: payload === undefined ? undefined : JSON.parse(payload),
          signal: abort.signal,
        });
        if (current()) setResponse({ key, data, error: null });
      } catch (error) {
        if (
          current() &&
          !(error instanceof Error && error.name === "AbortError")
        )
          setResponse((previous) => ({
            key,
            data:
              error instanceof ApiError &&
              [401, 403, 404].includes(error.status)
                ? null
                : previous?.key === key
                  ? previous.data
                  : null,
            error: errorMessage(error),
          }));
      } finally {
        inFlight = false;
        if (current() && !document.hidden)
          timer = setTimeout(() => void load(), interval);
      }
    };
    const visible = () => {
      clearTimeout(timer);
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", visible);
    void load();
    return () => {
      stopped = true;
      abort.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [path, method, payload, key, interval, revision, externalRevision]);
  const refresh = () => {
    epoch.current += 1;
    setRevision((value) => value + 1);
  };
  const replace = (data: T) => {
    epoch.current += 1;
    setResponse({ key, data, error: null });
    setRevision((value) => value + 1);
  };
  return {
    data: response?.key === key ? response.data : null,
    error: response?.key === key ? response.error : null,
    loading: Boolean(path) && response?.key !== key,
    refresh,
    replace,
  };
}
