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
