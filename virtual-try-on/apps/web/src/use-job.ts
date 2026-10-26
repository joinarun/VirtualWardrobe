import { useEffect, useRef, useState } from "react";
import { api, ApiError, errorMessage } from "./api";
import type { TryOnJob } from "./tryon-types";
import { activeJob } from "./tryon-types";
export function useJob(id: string) {
  const [revision, setRevision] = useState(0);
  const epoch = useRef(0);
  const [result, setResult] = useState<{
    id: string;
    job: TryOnJob | null;
    error: string | null;
  } | null>(null);
  useEffect(() => {
    const version = ++epoch.current;
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      failures = 0,
      inFlight = false;
    const abort = new AbortController();
    const current = () => !stopped && version === epoch.current;
    const schedule = (delay: number) => {
      if (current() && !document.hidden)
        timer = setTimeout(() => void load(), delay);
    };
    const load = async () => {
      if (!current() || inFlight) return;
      inFlight = true;
      try {
        const job = await api<TryOnJob>(
          `/me/try-on/jobs/${encodeURIComponent(id)}`,
          { signal: abort.signal },
        );
        if (!current()) return;
        failures = 0;
        setResult({ id, job, error: null });
        if (activeJob(job)) schedule(3000);
      } catch (error) {
        if (
          !current() ||
          (error instanceof Error && error.name === "AbortError")
        )
          return;
        failures += 1;
        setResult((previous) => ({
          id,
          job:
            error instanceof ApiError && [401, 404].includes(error.status)
              ? null
              : previous?.id === id
                ? previous.job
                : null,
          error: errorMessage(error),
        }));
        if (!(error instanceof ApiError && [401, 404].includes(error.status)))
          schedule(Math.min(30000, 3000 * failures));
      } finally {
        inFlight = false;
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", visibility);
    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
      abort.abort();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [id, revision]);
  const refresh = () => {
    epoch.current += 1;
    setRevision((value) => value + 1);
  };
  const replace = (job: TryOnJob) => {
    epoch.current += 1;
    setResult({ id, job, error: null });
    setRevision((value) => value + 1);
  };
  return {
    job: result?.id === id ? result.job : null,
    error: result?.id === id ? result.error : null,
    loading: result?.id !== id,
    refresh,
    replace,
  };
}
