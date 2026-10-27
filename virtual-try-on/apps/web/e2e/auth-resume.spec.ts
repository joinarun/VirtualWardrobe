import { test, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

// Explicit UI fixtures; real cookie lifetime/revocation has separate HTTP/backend coverage.
const customer = {
  id: "10000000-0000-0000-0000-000000000001",
  kind: "CUSTOMER", name: "Resume fixture", phone: "+919000000001",
  enabled: true, superAdmin: false, passwordChangeRequired: false, memberships: [],
};
function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
async function safeFulfill(route: Route, json: unknown, status = 200) {
  if (route.request().failure()) return;
  await route.fulfill({ status, json }).catch(() => { /* An invalidated read may be aborted. */ });
}
async function base(page: Page, session: () => unknown) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/session") return safeFulfill(route, { user: session() });
    if (path === "/api/v1/auth/config") return safeFulfill(route, {
      signupEnabled: true, passwordMinLength: 12, captcha: { mode: "LOCAL_TEST", action: "signup" },
    });
    if (path === "/api/v1/auth/csrf") return safeFulfill(route, { token: "fixture-token", headerName: "X-CSRF-TOKEN" });
    if (path === "/api/v1/auth/login") return safeFulfill(route, { user: customer });
    if (path === "/api/v1/try-on/config") return safeFulfill(route, { mode: "LIVE" });
    return safeFulfill(route, { code: "UNAUTHENTICATED" }, 401);
  });
}

test("UI race: a delayed anonymous read cannot overwrite a completed login", async ({ page }) => {
  const initial = latch(), rotatedCsrf = latch();
  let signedIn = false, csrfCalls = 0, waiting = 0;
  await base(page, () => signedIn ? customer : null);
  await page.route("**/api/v1/auth/session", async (route) => {
    if (!signedIn) { waiting += 1; await initial.promise; return safeFulfill(route, { user: null }); }
    return safeFulfill(route, { user: customer });
  });
  await page.route("**/api/v1/auth/login", async (route) => {
    signedIn = true;
    await safeFulfill(route, { user: customer });
  });
  await page.route("**/api/v1/auth/csrf", async (route) => {
    csrfCalls += 1;
    if (csrfCalls > 1) await rotatedCsrf.promise;
    await safeFulfill(route, { token: `fixture-${csrfCalls}`, headerName: "X-CSRF-TOKEN" });
  });
  await page.goto("/account/login");
  await expect.poll(() => waiting).toBeGreaterThan(0);
  await page.getByLabel("Mobile number with country code").fill(customer.phone);
  await page.getByLabel("Password", { exact: true }).fill("Only-a-UI-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/You are currently signed in as Resume fixture/)).toBeVisible();
  initial.release();
  await page.waitForTimeout(100);
  await expect(page.getByText(/You are currently signed in as Resume fixture/)).toBeVisible();
  rotatedCsrf.release();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Hello, Resume fixture." })).toBeVisible();
});

test("UI resume: transient reads retain known auth and only confirmed guest signs out", async ({ page }) => {
  let session: typeof customer | null = customer, unavailable = false, reads = 0;
  await base(page, () => session);
  await page.route("**/api/v1/auth/session", async (route) => {
    reads += 1;
    await safeFulfill(route, unavailable ? { code: "SERVICE_UNAVAILABLE" } : { user: session }, unavailable ? 503 : 200);
  });
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Hello, Resume fixture." })).toBeVisible();
  unavailable = true;
  const before = reads;
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(page.getByRole("heading", { name: "Hello, Resume fixture." })).toBeVisible();
  expect(reads - before).toBeLessThanOrEqual(2);
  unavailable = false; session = null;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("heading", { name: "Good to see you again." })).toBeVisible();
});

test("UI reconnect: a fresh document with a failed session read does not assert signed out", async ({ page }) => {
  let unavailable = true;
  await base(page, () => customer);
  await page.route("**/api/v1/auth/session", (route) => safeFulfill(route,
    unavailable ? { code: "SERVICE_UNAVAILABLE" } : { user: customer }, unavailable ? 503 : 200));
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Reconnect to your wardrobe." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "Retry connection", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hello, Resume fixture." })).toBeVisible();
});

test("UI account switch: a delayed old401 cannot end the newly signed-in account", async ({ page }) => {
  const oldRead = latch(), csrfRotation = latch();
  const next = { ...customer, id: "10000000-0000-0000-0000-000000000002", name: "Switched fixture" };
  let session = customer, requested = false, calls = 0;
  await base(page, () => session);
  await page.route("**/api/v1/auth/login", async (route) => {
    session = next;
    await safeFulfill(route, { user: next });
  });
  await page.route("**/api/v1/ui-old-private-read", async (route) => {
    requested = true; await oldRead.promise;
    await safeFulfill(route, { code: "UNAUTHENTICATED" }, 401);
  });
  await page.route("**/api/v1/auth/csrf", async (route) => {
    if (++calls > 1) await csrfRotation.promise;
    await safeFulfill(route, { token: "fixture-switch-token", headerName: "X-CSRF-TOKEN" });
  });
  await page.goto("/account/login");
  await expect(page.getByText(/You are currently signed in as Resume fixture/)).toBeVisible();
  await page.evaluate(() => { void import(String("/src/api.ts")).then((api) => api.api("/ui-old-private-read")).catch(() => {}); });
  await expect.poll(() => requested).toBeTruthy();
  await page.getByLabel("Mobile number with country code").fill(customer.phone);
  await page.getByLabel("Password", { exact: true }).fill("Only-a-UI-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/You are currently signed in as Switched fixture/)).toBeVisible();
  oldRead.release();
  await page.waitForTimeout(200);
  await expect(page.getByText(/You are currently signed in as Switched fixture/)).toBeVisible();
  csrfRotation.release();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Hello, Switched fixture." })).toBeVisible();
});

test("UI security: an older CSRF read cannot replace a newer session token", async ({ page }) => {
  const old = latch();
  let calls = 0, sent = "";
  await base(page, () => customer);
  await page.route("**/api/v1/auth/csrf", async (route) => {
    const number = ++calls;
    if (number === 1) await old.promise;
    await safeFulfill(route, { token: number === 1 ? "old-fixture" : "current-fixture", headerName: "X-CSRF-TOKEN" });
  });
  await page.route("**/api/v1/ui-security-probe", async (route) => {
    sent = route.request().headers()["x-csrf-token"] || "";
    await safeFulfill(route, { ok: true });
  });
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Hello, Resume fixture." })).toBeVisible();
  await page.evaluate(() => { void import(String("/src/api.ts")).then((api) => api.refreshCsrf()).catch(() => {}); });
  await expect.poll(() => calls).toBe(1);
  await page.evaluate(async () => { const api = await import(String("/src/api.ts")); await api.refreshCsrf(); });
  old.release();
  await page.waitForTimeout(100);
  await page.evaluate(async () => { const api = await import(String("/src/api.ts")); await api.api("/ui-security-probe", { method: "POST", body: {} }); });
  expect(sent).toBe("current-fixture");
});

test("UI reconnect: a stable session401 does not create an automatic request loop", async ({ page }) => {
  let reads = 0;
  await base(page, () => null);
  await page.route("**/api/v1/auth/session", async (route) => {
    reads += 1;
    await safeFulfill(route, { code: "EDGE_UNAVAILABLE" }, 401);
  });
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Reconnect to your wardrobe." })).toBeVisible();
  await page.waitForTimeout(250);
  const settled = reads;
  await page.waitForTimeout(700);
  expect(reads).toBe(settled);
  await page.getByRole("button", { name: "Retry connection", exact: true }).click();
  await expect.poll(() => reads).toBeGreaterThan(settled);
  const retried = reads;
  await page.waitForTimeout(500);
  expect(reads).toBe(retried);
});

test("UI authority: malformed successful responses never confirm a guest", async ({ page }) => {
  let malformed = false, reads = 0;
  await base(page, () => customer);
  await page.route("**/api/v1/auth/session", async (route) => {
    reads += 1;
    await safeFulfill(route, malformed ? {} : { user: customer });
  });
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Hello, Resume fixture." })).toBeVisible();
  malformed = true;
  const before = reads;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(page.getByRole("heading", { name: "Hello, Resume fixture." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Reconnect to your wardrobe." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
});

test("UI workforce switch: scoped cached stores are remounted for the new account", async ({ page }) => {
  const first = { ...customer, kind: "WORKFORCE", name: "First staff fixture", memberships: [{ membershipId: "membership-first", storeId: "store-first", storeName: "First scoped fixture", role: "STAFF", state: "ACTIVE" }] };
  const second = { ...first, id: "10000000-0000-0000-0000-000000000002", name: "Second staff fixture", memberships: [{ ...first.memberships[0], storeId: "store-second", storeName: "Second scoped fixture" }] };
  let current = first;
  await base(page, () => current);
  await page.route(/\/api\/v1\/stores\?managed=true$/, (route) => safeFulfill(route, { items: [{ id: current.memberships[0].storeId, name: current.memberships[0].storeName, description: "Explicit scoped UI fixture", status: "ACTIVE" }] }));
  await page.route("**/enquiries/counts", (route) => safeFulfill(route, { unassignedNew: 0, assignedToMe: 0, active: 0, total: 0 }));
  await page.goto("/staff");
  await expect(page.locator(".staff-identity strong")).toHaveText("First staff fixture");
  await expect(page.getByRole("heading", { name: "First scoped fixture", exact: true })).toBeVisible();
  current = second;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".staff-identity strong")).toHaveText("Second staff fixture");
  await expect(page.getByRole("heading", { name: "Second scoped fixture", exact: true })).toBeVisible();
  await expect(page.getByText("First scoped fixture")).toHaveCount(0);
});
