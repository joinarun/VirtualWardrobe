import { useEffect, useRef, useState } from "react";

const unsaved = new Set<() => boolean>();
const mayLeave = () => !Array.from(unsaved).some((check) => check()) ||
  window.confirm("Leave this page? Your unsent changes will not be saved.");

export function useUnsavedChanges(active: boolean) {
  const current = useRef(active);
  const permitted = useRef(false);
  useEffect(() => {
    const check = () => current.current && !permitted.current;
    unsaved.add(check);
    const before = (event: BeforeUnloadEvent) => {
      if (check()) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", before);
    return () => { unsaved.delete(check); window.removeEventListener("beforeunload", before); };
  }, []);
  useEffect(() => { current.current = active; if (!active) permitted.current = false; }, [active]);
  return () => { permitted.current = true; };
}

export function useCustomerLocation() {
  const [location, setLocation] = useState(window.location.href);
  const previous = useRef(window.location.href);
  const focusedLocation = useRef(location);
  useEffect(() => {
    const update = () => { previous.current = window.location.href; setLocation(window.location.href); };
    const back = () => {
      if (!mayLeave()) { window.history.pushState(null, "", previous.current); return; }
      update();
    };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest?.("a");
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin || !["http:", "https:"].includes(url.protocol) ||
        url.pathname.startsWith("/api/") || url.pathname.startsWith("/staff") ||
        window.location.pathname.startsWith("/staff") ||
        /^\/account\/(login|signup|recover|password)$/.test(url.pathname) ||
        (url.pathname === window.location.pathname && url.search === window.location.search && url.hash)) return;
      event.preventDefault();
      if (!mayLeave()) return;
      window.history.pushState(null, "", url.pathname + url.search + url.hash);
      update();
    };
    document.addEventListener("click", click);
    window.addEventListener("popstate", back);
    return () => { document.removeEventListener("click", click); window.removeEventListener("popstate", back); };
  }, []);
  useEffect(() => {
    if (focusedLocation.current === location) return;
    focusedLocation.current = location;
    window.scrollTo({ top: 0, behavior: "instant" });
    const frame = requestAnimationFrame(() => document.getElementById("main-content")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [location]);
  return location;
}

export function customerReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return "/account";
  try {
    const url = new URL(value, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      (![
        "/try-on",
        "/callback",
        "/account/enquiries",
        "/account",
        "/account/gallery",
        "/account/previews",
      ].includes(url.pathname) &&
        !/^\/account\/(?:previews|enquiries)\/[a-f0-9-]{36}$/.test(
          url.pathname,
        ))
    )
      return "/account";
    return url.pathname + url.search;
  } catch {
    return "/account";
  }
}
export function authLink(path: string, returnTo: string) {
  return returnTo === "/account"
    ? path
    : `${path}?next=${encodeURIComponent(returnTo)}`;
}
