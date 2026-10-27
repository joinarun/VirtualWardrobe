(() => {
  const valid = (value) => value === "pearl" || value === "sage" || value === "midnight" || value === "system";
  let preference = "system";
  try {
    const stored = window.localStorage.getItem("vw-appearance-v1");
    if (valid(stored)) preference = stored;
  } catch {
    // An unavailable preference store must not block the application.
  }
  let dark = false;
  try {
    dark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    // Use the light system palette if media preferences are unavailable.
  }
  const theme = preference === "system" ? (dark ? "midnight" : "pearl") : preference;
  const background = { pearl: "#faf8f4", sage: "#f0f7f2", midnight: "#1c1922" }[theme];
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = theme;
  root.style.colorScheme = theme === "midnight" ? "dark" : "light";
  root.style.backgroundColor = background;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = background;
})();
