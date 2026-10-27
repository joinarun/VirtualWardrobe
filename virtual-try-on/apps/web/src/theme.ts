import { useSyncExternalStore } from "react";
import "./theme.css";

export type ThemePreference = "pearl" | "sage" | "midnight" | "system";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export const THEME_STORAGE_KEY = "vw-appearance-v1";
const DEFAULT_PREFERENCE: ThemePreference = "system";
const BACKGROUNDS: Record<ResolvedTheme, string> = {
  pearl: "#faf8f4",
  sage: "#f0f7f2",
  midnight: "#1c1922",
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "pearl" || value === "sage" || value === "midnight" || value === "system";
}

function readPreference(): ThemePreference | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_PREFERENCE;
  } catch {
    return undefined;
  }
}

function systemQuery(): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  try {
    return typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
  } catch {
    return null;
  }
}

function initializedPreference(): ThemePreference {
  const stored = readPreference();
  if (stored) return stored;
  const initial = typeof document === "undefined" ? undefined : document.documentElement.dataset.themePreference;
  return isThemePreference(initial) ? initial : DEFAULT_PREFERENCE;
}

let media = systemQuery();
let preference = initializedPreference();
let memoryOnly = false;
const listeners = new Set<() => void>();

export function resolveTheme(value: ThemePreference, dark = media?.matches ?? false): ResolvedTheme {
  return value === "system" ? (dark ? "midnight" : "pearl") : value;
}

function applyPreference(value: ThemePreference) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(value);
  const root = document.documentElement;
  root.dataset.themePreference = value;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved === "midnight" ? "dark" : "light";
  root.style.backgroundColor = BACKGROUNDS[resolved];
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = BACKGROUNDS[resolved];
}

function update(value: ThemePreference) {
  const changed = preference !== value;
  preference = value;
  applyPreference(value);
  if (changed) listeners.forEach((listener) => listener());
}

export function setThemePreference(value: ThemePreference) {
  if (!isThemePreference(value)) return;
  memoryOnly = false;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    // Keep this tab usable when private browsing or a storage quota blocks writes.
    memoryOnly = true;
  }
  update(value);
}

function storageChanged(event: StorageEvent) {
  if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
  try {
    if (event.storageArea && event.storageArea !== window.localStorage) return;
  } catch {
    return;
  }
  memoryOnly = false;
  update(isThemePreference(event.newValue) ? event.newValue : DEFAULT_PREFERENCE);
}

function systemChanged() {
  if (preference === "system") applyPreference(preference);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    media ??= systemQuery();
    if (!memoryOnly) update(readPreference() ?? preference);
    else applyPreference(preference);
    window.addEventListener("storage", storageChanged);
    if (typeof media?.addEventListener === "function") media.addEventListener("change", systemChanged);
    else if (typeof media?.addListener === "function") media.addListener(systemChanged);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", storageChanged);
      if (typeof media?.removeEventListener === "function") media.removeEventListener("change", systemChanged);
      else if (typeof media?.removeListener === "function") media.removeListener(systemChanged);
    }
  };
}

export function getThemePreference(): ThemePreference {
  return preference;
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getThemePreference, () => DEFAULT_PREFERENCE);
}

applyPreference(preference);
