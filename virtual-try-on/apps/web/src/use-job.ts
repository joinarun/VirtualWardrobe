import { useEffect, useRef, useState } from "react";
import { api, ApiError, errorMessage } from "./api";
import type { TryOnJob } from "./tryon-types";
import { activeJob } from "./tryon-types";
export function useJob(id: string) {
  const [revision, setRevision] = useState(0);
  const epoch = useRef(0);
  const [result, setResult] = useState<{ id: string; job: TryOnJob | null; error: string | null } | null>(null);
  useEffect(() => {
    const version = ++epoch.current;
    let stopped = false, serial = 0, failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: AbortController | null = null;
    const current = () => !stopped && version === epoch.current;
    const schedule = (delay: number) => {
      clearTimeout(timer);
      if (current() && !document.hidden) timer = setTimeout(() => void load(), delay);
    };
    const load = async () => {
      if (!current() || document.hidden) return;
      active?.abort();
      const request = ++serial;
      const abort = new AbortController();
      active = abort;
      const latest = () => current() && request === serial && !abort.signal.aborted;
      try {
        const job = await api<TryOnJob>(`/me/try-on/jobs/${encodeURIComponent(id)}`, { signal: abort.signal });
        if (!latest()) return;
        failures = 0;
        setResult({ id, job, error: null });
        if (activeJob(job)) schedule(3000);
      } catch (error) {
        if (!latest() || (error instanceof Error && error.name === "AbortError")) return;
        failures += 1;
        const denied = error instanceof ApiError && [401, 404].includes(error.status);
        setResult((previous) => ({ id, job: denied ? null : previous?.id === id ? previous.job : null,
          error: errorMessage(error) }));
        if (!denied) schedule(Math.min(30000, 3000 * failures));
      } finally {
        if (request === serial) active = null;
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
      clearTimeout(timer);
      active?.abort();
      document.removeEventListener("visibilitychange", resume);
      for (const name of ["focus", "pageshow", "online"]) window.removeEventListener(name, resume);
    };
  }, [id, revision]);
  const refresh = () => { epoch.current += 1; setRevision((value) => value + 1); };
  const replace = (job: TryOnJob) => {
    epoch.current += 1;
    setResult({ id, job, error: null });
    setRevision((value) => value + 1);
  };
  return { job: result?.id === id ? result.job : null,
    error: result?.id === id ? result.error : null, loading: result?.id !== id, refresh, replace };
}
