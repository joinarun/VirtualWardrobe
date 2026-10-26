import { useEffect, useState } from "react";
import { api, errorMessage } from "./api";

export function useRemote<T>(path: string | null, revision = 0) {
  const key = `${revision}:${path}`;
  const [result, setResult] = useState<{
    key: string;
    data: T | null;
    error: string | null;
  } | null>(null);
  useEffect(() => {
    if (!path) return;
    const abort = new AbortController();
    api<T>(path, { signal: abort.signal })
      .then((data) => setResult({ key, data, error: null }))
      .catch((failure) => {
        if (!(failure instanceof Error && failure.name === "AbortError"))
          setResult({ key, data: null, error: errorMessage(failure) });
      });
    return () => abort.abort();
  }, [path, key]);
  const current = result?.key === key;
  return {
    data: current ? result.data : null,
    loading: Boolean(path) && !current,
    error: current ? result.error : null,
  };
}
export function checkedItems<T>(data: { items: T[] } | null): T[] {
  if (!data) return [];
  if (!Array.isArray(data.items))
    throw new Error(
      "The service returned an unexpected list. Please refresh and try again.",
    );
  return data.items;
}
