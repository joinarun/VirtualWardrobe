import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { assertWcagAA } from "./contrast";

// Explicit UI fixtures: every API response is controlled, and all mutations are denied.
const BASE = process.env.BASE_URL || "http://localhost:5173";
const KEY = "vw-appearance-v1";
const THEMES = ["pearl", "sage", "midnight", "system"] as const;
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const STORE = "55555555-5555-4555-8555-555555555555";
const JOB = "11111111-1111-4111-8111-111111111111";
const MEDIA = "33333333-3333-4333-8333-333333333333";
const CREATED = "2026-10-27T00:00:00Z";
const customer = { id: "44444444-4444-4444-8444-444444444444", name: "Theme fixture", kind: "CUSTOMER",
  phone: "+919000000009", phoneVerified: false, enabled: true, superAdmin: false, passwordChangeRequired: false, memberships: [] };
const store = { id: STORE, name: "Theme fixture store", description: "An explicit UI fixture, not a real store.",
  status: "ACTIVE", logoUrl: null, contactPhone: null };
const product = { id: PRODUCT, storeId: STORE, storeName: store.name, sku: "THEME-FIXTURE", title: "Theme fixture saree",
  description: "Original owned imagery for a controlled UI check.", categoryId: null, categoryPath: [], brandId: null,
  labels: [], price: "2500.00", currency: "INR", fabric: "Silk", colour: "Rose", size: "Free size", status: "PUBLISHED",
  availability: "AVAILABLE", tryOnEnabled: true, coverUrl: "/demo/saree-rose.png", createdAt: CREATED, updatedAt: CREATED,
  media: [{ id: "77777777-7777-4777-8777-777777777777", kind: "IMAGE", state: "VALIDATED", mimeType: "image/png", url: "/demo/saree-rose.png", thumbnailUrl: "/demo/saree-rose.png", width: 1024, height: 1536, position: 0 }] };

async function fixtures(context: BrowserContext) {
  let workforce = false;
  const denied: string[] = [], unexpected: string[] = [];
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      denied.push(`${request.method()} ${path}`);
      await route.abort();
      return;
    }
    const json = (value: unknown) => route.fulfill({ json: value, headers: { "Cache-Control": "no-store" } });
    if (path === "/api/v1/auth/session") return json({ user: workforce ? { ...customer, kind: "WORKFORCE", name: "Theme staff fixture", phone: undefined, email: "theme-staff@example.test", memberships: [{ membershipId: "88888888-8888-4888-8888-888888888888", storeId: STORE, storeName: store.name, role: "STAFF", state: "ACTIVE" }] } : customer });
    if (path === "/api/v1/auth/config") return json({ signupEnabled: true, passwordMinLength: 12, captcha: { mode: "LOCAL_TEST", action: "signup" } });
    if (path === "/api/v1/auth/csrf") return json({ token: "unused-ui-fixture", headerName: "X-CSRF-TOKEN" });
    if (path === "/api/v1/stores") return json({ items: [store] });
    if (path === "/api/v1/categories" || path === "/api/v1/brands") return json({ items: [] });
    if (path === "/api/v1/products") return json({ items: [product], page: 0, size: 12, total: 1 });
    if (path === `/api/v1/products/${PRODUCT}`) return json(product);
    if (path === "/api/v1/try-on/config") return json({ enabled: true, disabledReason: null, mode: "LIVE",
      processingRequest: { version: "ui-theme-action-v2", action: "TRY_ON" }, provider: "fixture-provider", model: "fixture-model", location: "fixture-location",
      label: "Legacy provider label", notice: "EVALUATION_DEMO benchmark warning must stay out of customer screens.",
      consent: { version: "legacy-fixture", notice: "Legacy attestation", adultSelfOnly: true },
      limits: { customerDaily: 5, globalDaily: 100, dailyBudgetUsd: "5.00" } });
    if (path === "/api/v1/me/try-on/quota") return json({ used: 1, remaining: 4, limit: 5, saved: 1, savedLimit: 100, resetsAt: "2099-01-01T00:00:00Z" });
    const snapshot = { id: PRODUCT, title: product.title, sku: product.sku, storeId: STORE, storeName: store.name, price: product.price, currency: "INR" };
    const result = { id: MEDIA, imageUrl: `/api/v1/private-media/${MEDIA}/content`, downloadUrl: `/api/v1/private-media/${MEDIA}/download`, expiresAt: null, saved: true, saving: false };
    const job = { id: JOB, productId: PRODUCT, product: snapshot, state: "SUCCEEDED", createdAt: CREATED, updatedAt: CREATED, deadlineAt: CREATED, attempts: 1,
      provider: "fixture-provider", model: "fixture-model", demo: true, evaluationDemo: false, label: "Legacy label", notice: "Provider benchmark warning", discarded: false,
      error: null, result, canCancel: false, canSave: false, canDiscard: true };
    if (path === "/api/v1/me/try-on/jobs") return json({ items: [job], page: 0, size: 12, total: 1 });
    if (path === `/api/v1/me/try-on/jobs/${JOB}`) return json(job);
    if (path === "/api/v1/me/try-on/gallery") return json({ items: [{ ...result, jobId: JOB, product: snapshot, createdAt: CREATED, provider: job.provider, model: job.model, demo: true, evaluationDemo: false, label: job.label, notice: job.notice, currentAvailability: "AVAILABLE" }], page: 0, size: 12, total: 1 });
    if (path === `/api/v1/private-media/${MEDIA}/content`) return route.fulfill({ contentType: "image/jpeg", body: readFileSync(join(process.cwd(), "public/demo/hero-emerald-small.jpg")), headers: { "Cache-Control": "no-store" } });
    if (path === `/api/v1/stores/${STORE}/enquiries/counts`) return json({ unassignedNew: 0, active: 0, assignedToMe: 0 });
    unexpected.push(path);
    return route.fulfill({ status: 404, json: { code: "UI_FIXTURE_UNAVAILABLE" }, headers: { "Cache-Control": "no-store" } });
  });
  return { staff: () => { workforce = true; }, assertReadOnly: () => { expect(denied).toEqual([]);expect(unexpected).toEqual([]); } };
}
async function capture(page: Page, name: string) {
  if (!process.env.TEST_STATE_DIRECTORY) return;
  const path = join(process.env.TEST_STATE_DIRECTORY, `${name}.png`);
  await page.screenshot({ path, animations: "disabled", mask: [page.locator("input,textarea,.customer-account h1,.detail-list,.staff-identity")] });
  await chmod(path, 0o600);
}
async function appearance(page: Page, preference: string, resolved = preference === "system" ? "pearl" : preference) {
  await expect(page.locator("html")).toHaveAttribute("data-theme-preference", preference);
  await expect(page.locator("html")).toHaveAttribute("data-theme", resolved);
  await expect(page.getByRole("combobox", { name: "Appearance", exact: true })).toHaveValue(preference);
}
async function noImageFilter(page: Page) {
  const filters = await page.locator("main img").evaluateAll((images) => images.map((image) => getComputedStyle(image).filter));
  expect(filters.length).toBeGreaterThan(0);
  expect(filters.every((value) => value === "none")).toBeTruthy();
}
test.beforeAll(() => {
  expect(["localhost", "127.0.0.1", "web"]).toContain(new URL(BASE).hostname);
});

test("UI mobile appearance initializes valid and invalid stored choices before React", async ({ browser }) => {
  for (const [stored, preference, resolved, colour] of [["midnight", "midnight", "midnight", "rgb(28, 25, 34)"], ["not-a-theme", "system", "pearl", "rgb(250, 248, 244)"]]) {
    const context = await browser.newContext({ baseURL: BASE, colorScheme: "light" });
    const fixture = await fixtures(context);
    await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: KEY, value: stored });
    const page = await context.newPage();
    let release!: () => void, held = false;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route(/\/src\/main\.tsx(?:\?|$)/, async (route) => { held = true;await gate;await route.continue().catch(() => {}); });
    try {
      await page.goto("/", { waitUntil: "commit" });
      await expect.poll(() => held).toBeTruthy();
      await expect(page.locator("html")).toHaveAttribute("data-theme-preference", preference);
      await expect(page.locator("html")).toHaveAttribute("data-theme", resolved);
      await expect(page.locator("#root")).toBeEmpty();
      expect(await page.locator("html").evaluate((root) => getComputedStyle(root).backgroundColor)).toBe(colour);
      release();
      await expect(page.locator(".product-card")).toBeVisible();
      await appearance(page, preference, resolved);
      // Pixel capture waits for fonts in WebKit; the assertions above already
      // proved initialization while React was held. Capture only after release.
      await capture(page, `009-initialized-${stored}`);
      fixture.assertReadOnly();
    } finally { release();await context.close(); }
  }
});

for (const theme of THEMES) test(`UI mobile appearance ${theme} is accessible on customer and staff surfaces`, async ({ page }) => {
  test.setTimeout(60000);
  const fixture = await fixtures(page.context());
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator(".product-card")).toBeVisible();
  await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(theme);
  await page.reload();
  await appearance(page, theme);
  await noImageFilter(page);
  await assertWcagAA(page);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Hello, Theme fixture.", exact: true })).toBeVisible();
  await appearance(page, theme);
  await assertWcagAA(page);
  await page.goto(`/try-on?product=${PRODUCT}`);
  await expect(page.getByRole("heading", { name: "See yourself in it.", exact: true })).toBeVisible();
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(page.getByText(/fixture-provider|fixture-model|EVALUATION_DEMO|benchmark|attestation/i)).toHaveCount(0);
  await appearance(page, theme);
  await noImageFilter(page);
  await assertWcagAA(page);
  await capture(page, `009-theme-${theme}-photo`);
  fixture.staff();
  await page.goto("/staff");
  await expect(page.getByRole("heading", { name: "Your store, thoughtfully managed.", exact: true })).toBeVisible();
  await appearance(page, theme);
  await assertWcagAA(page);
  await capture(page, `009-theme-${theme}-staff`);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([KEY]);
  expect(THEMES).toContain(await page.evaluate((key) => localStorage.getItem(key), KEY));
  fixture.assertReadOnly();
});

test("UI mobile appearance follows other tabs and the system and supports keyboard selection", async ({ page }) => {
  const fixture = await fixtures(page.context());
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/account");
  const chooser = page.getByRole("combobox", { name: "Appearance", exact: true });
  await chooser.selectOption("sage");
  const other = await page.context().newPage();
  await other.emulateMedia({ colorScheme: "light" });
  await other.goto("/account");
  await appearance(other, "sage");
  await other.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("midnight");
  await appearance(page, "midnight");
  await other.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("system");
  await appearance(page, "system", "pearl");
  await page.emulateMedia({ colorScheme: "dark" });
  await appearance(page, "system", "midnight");
  await appearance(other, "system", "pearl");
  await page.bringToFront();
  await chooser.focus();
  await expect(chooser).toBeFocused();
  await chooser.press("s");await chooser.press("Enter");
  await appearance(page, "sage");
  await appearance(other, "sage");
  await page.reload();
  await appearance(page, "sage");
  expect(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])))).toEqual({ [KEY]: "sage" });
  fixture.assertReadOnly();
});

test("UI mobile appearance remains usable when preference storage is unavailable", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE, colorScheme: "dark" });
  const fixture = await fixtures(context);
  await context.addInitScript(() => { for (const method of ["getItem", "setItem", "removeItem"])
    Object.defineProperty(Storage.prototype, method, { configurable: true, value: () => { throw new DOMException("Storage unavailable", "SecurityError"); } }); });
  const page = await context.newPage();const errors: string[] = [];
  page.on("pageerror", () => errors.push("PAGE_ERROR"));
  try {
    await page.goto("/account");
    await appearance(page, "system", "midnight");
    await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("sage");
    await appearance(page, "sage");
    await expect(page.getByRole("heading", { name: "Hello, Theme fixture.", exact: true })).toBeVisible();
    await page.reload();
    await appearance(page, "system", "midnight");
    await assertWcagAA(page);
    expect(errors).toEqual([]);fixture.assertReadOnly();
  } finally { await context.close(); }
});

for (const [width, height] of [[360, 800], [390, 844], [430, 932], [844, 390], [1280, 844]]) test(`UI mobile layout ${width}x${height} keeps content and actions reachable`, async ({ page }) => {
  test.setTimeout(60000);
  const fixture = await fixtures(page.context());
  await page.setViewportSize({ width, height });
  for (const [name, path, selector] of [["collection", "/", ".product-card"], ["product", `/products/${PRODUCT}`, ".detail-main-image"],
    ["saved", "/account/gallery", ".wardrobe-card"], ["result", `/account/previews/${JOB}`, ".result-image-caption"], ["photo", `/try-on?product=${PRODUCT}`, ".photo-step"]]) {
    await page.goto(path);
    await expect(page.locator(selector).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await noImageFilter(page);
    await expect(page.getByText(/fixture-provider|fixture-model|EVALUATION_DEMO|benchmark|attestation|AI-generated preview/i)).toHaveCount(0);
    if (width <= 430) {
      const nav = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
      await expect(nav).toBeVisible();
      for (const label of ["Collection", "Previews", "Saved", "Account"]) {
        const box = await nav.getByRole("link", { name: label, exact: true }).boundingBox();
        expect(Boolean(box && box.width >= 44 && box.height >= 44)).toBeTruthy();
      }
      const appearanceBox = await page.getByRole("combobox", { name: "Appearance", exact: true }).boundingBox();
      expect(Boolean(appearanceBox && appearanceBox.width >= 44 && appearanceBox.height >= 44)).toBeTruthy();
    }
    await capture(page, `009-layout-${width}-${name}`);
    if (name === "photo") {
      await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Create my preview", exact: true })).toBeDisabled();
      const choose = page.getByLabel("Choose a photo", { exact: true });
      await choose.setInputFiles(join(process.cwd(), "public/demo/hero-emerald-small.jpg"));
      const create = page.getByRole("button", { name: "Create my preview", exact: true });
      await expect(create).toBeEnabled();
      if (width <= 430) {
        const button = await create.boundingBox(), nav = await page.getByRole("navigation", { name: "Mobile navigation", exact: true }).boundingBox();
        expect(Boolean(button && nav && button.height >= 44 && button.x >= 0 && button.x + button.width <= width && button.y >= 0 && button.y + button.height <= nav.y)).toBeTruthy();
      }
      await capture(page, `009-layout-${width}-photo-selected`);
    }
  }
  fixture.assertReadOnly();
});
