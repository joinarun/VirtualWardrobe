import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("UI lifecycle: foreground replaces a stalled read and reload resumes the same job without creation", async ({ page }) => {
  const id = "20000000-0000-0000-0000-000000000001";
  const productId = "30000000-0000-0000-0000-000000000001";
  const user = { id: "10000000-0000-0000-0000-000000000001", name: "Lifecycle UI fixture", kind: "CUSTOMER", enabled: true, superAdmin: false, passwordChangeRequired: false, memberships: [] };
  const job = { id, productId, product: { id: productId, title: "Lifecycle sample saree", storeId: "fixture-store", storeName: "Fixture atelier", sku: "SAMPLE", price: "1000.00", currency: "INR" },
    state: "QUEUED", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deadlineAt: new Date(Date.now() + 180000).toISOString(), attempts: 0,
    provider: "mock", model: "fixture-v1", demo: true, evaluationDemo: false, label: "Operator-only metadata", notice: "Provider benchmark metadata must not appear", discarded: false, error: null,
    result: null, canCancel: true, canSave: false, canDiscard: true };
  let stall = false, held = false, ready = false, creations = 0;
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") { creations += 1; return route.abort(); }
    if (path === "/api/v1/auth/session") return route.fulfill({ json: { user } });
    if (path === "/api/v1/auth/config") return route.fulfill({ json: { signupEnabled: true, captcha: { mode: "LOCAL_TEST", action: "signup" }, passwordMinLength: 12 } });
    if (path === `/api/v1/me/try-on/jobs/${id}`) {
      if (stall && !held) { held = true; await delayed; await route.fulfill({ json: job }).catch(() => {}); return; }
      return route.fulfill({ json: ready ? { ...job, state: "SUCCEEDED", attempts: 1, canCancel: false, canSave: true,
        result: { id: "fixture-output", imageUrl: "/api/v1/private-media/fixture-output/content", downloadUrl: "/api/v1/private-media/fixture-output/download", saved: false, saving: false, expiresAt: null } } : job });
    }
    if (path.startsWith("/api/v1/private-media/")) return route.fulfill({ contentType: "image/jpeg", body: readFileSync(join(process.cwd(), "public/demo/hero-emerald-small.jpg")) });
    if (path === `/api/v1/products/${productId}`) return route.fulfill({ json: { ...job.product, status: "PUBLISHED", availability: "AVAILABLE" } });
    return route.fulfill({ status: 404, json: { code: "UI_FIXTURE_ROUTE" } });
  });
  await page.goto(`/account/previews/${id}`);
  await expect(page.getByRole("heading", { name: "Queued", exact: true })).toBeVisible();
  await page.waitForTimeout(200);
  stall = true;
  await page.getByRole("button", { name: "Refresh request status", exact: true }).click();
  await expect.poll(() => held).toBeTruthy();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  ready = true;
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect(page.getByRole("heading", { name: "Preview ready", exact: true })).toBeVisible();
  release();
  await page.waitForTimeout(100);
  await expect(page.getByRole("heading", { name: "Preview ready", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Preview ready", exact: true })).toBeVisible();
  await expect(page.getByText("Provider benchmark metadata must not appear")).toHaveCount(0);
  expect(creations).toBe(0);
});
