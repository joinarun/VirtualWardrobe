import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Product } from "../src/catalog-types";
import { assertWcagAA } from "./contrast";
import { chmodSync } from "node:fs";
import { join } from "node:path";
const STORE = "11111111-1111-4111-8111-111111111111";
const FIRST = "22222222-2222-4222-8222-222222222222", SECOND = "33333333-3333-4333-8333-333333333333", THIRD = "44444444-4444-4444-8444-444444444444";
function product(id: string, title: string): Product {
  return { id, storeId: STORE, storeName: "Owned editor store", sku: id === FIRST ? "ONE" : id === SECOND ? "TWO" : "NEW", title, description: "", categoryId: null, categoryPath: [], brandId: null, labels: [], price: "2500.00", currency: "INR", fabric: "Silk", colour: "Ruby", size: "Free size", status: "DRAFT", availability: "AVAILABLE", tryOnEnabled: true, createdAt: "2026-10-31T00:00:00Z", updatedAt: "2026-10-31T00:00:00Z", media: [] };
}
async function fixture(page: Page) {
  const products = [product(FIRST, "First owned saree"), product(SECOND, "Second owned saree")];
  const changes: string[] = [], unexpected: string[] = [];
  let rejectNext = false, pending: { start: () => void; released: Promise<void> } | null = null;
  await page.route("**/api/v1/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    if (method === "PATCH" && path.startsWith(`/api/v1/stores/${STORE}/products/`)) {
      const held = pending; pending = null; if (held) { held.start(); await held.released; }
      if (rejectNext) { rejectNext = false; return route.fulfill({ status: 409, json: { detail: "Fixture save conflict. Retry or keep your changes." } }); }
      const index = products.findIndex(item => path.endsWith(`/${item.id}`)); expect(index).toBeGreaterThanOrEqual(0);
      products[index] = { ...products[index], ...request.postDataJSON() }; changes.push(path); return route.fulfill({ json: products[index] });
    }
    if (method === "POST" && path === `/api/v1/stores/${STORE}/products`) {
      const created = { ...product(THIRD, "New owned saree"), ...request.postDataJSON() }; products.push(created); changes.push(path); return route.fulfill({ json: created });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) { unexpected.push(`${method} ${path}`); return route.abort(); }
    if (path === "/api/v1/auth/session") return route.fulfill({ json: { user: { id: "55555555-5555-4555-8555-555555555555", kind: "WORKFORCE", name: "Editor fixture", email: "editor@wardrobe.test", enabled: true, superAdmin: true, passwordChangeRequired: false, memberships: [] } } });
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { headerName: "X-CSRF-TOKEN", token: "owned-ui-fixture" } });
    if (path === "/api/v1/auth/config") return route.fulfill({ json: { signupEnabled: false, passwordMinLength: 12, captcha: { mode: "DISABLED" } } });
    if (path === "/api/v1/stores") return route.fulfill({ json: { items: [{ id: STORE, name: "Owned editor store", description: "", status: "ACTIVE" }] } });
    if (path === `/api/v1/stores/${STORE}/enquiries/counts`) return route.fulfill({ json: { active: 0, unassigned: 0 } });
    if (path === `/api/v1/stores/${STORE}/products`) return route.fulfill({ json: { items: products, total: products.length, page: 0, size: 15 } });
    if (["/api/v1/categories", "/api/v1/brands"].includes(path)) return route.fulfill({ json: { items: [] } });
    if (path === "/api/v1/try-on/config") return route.fulfill({ json: { mode: "FIXTURE", evaluationDemo: false, notice: "" } });
    return route.fulfill({ status: 404, json: { code: "EDITOR_FIXTURE_UNAVAILABLE" } });
  });
  await page.goto("/staff"); await page.getByRole("button", { name: "Products", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit First owned saree", exact: true })).toBeVisible();
  return { products, changes,
    holdNextPatch() { let start!: () => void, release!: () => void; const started = new Promise<void>(resolve => { start = resolve; }); const released = new Promise<void>(resolve => { release = resolve; }); pending = { start, released }; return { started, release }; },
    failNextPatch() { rejectNext = true; }, verify() { expect(unexpected).toEqual([]); },
  };
}
for (const width of [360, 1280]) {
  test(`saved products can be edited in sequence at ${width}px without losing dirty or in-flight changes`, async ({ page }) => {
    test.setTimeout(60000); await page.setViewportSize({ width, height: 950 }); const state = await fixture(page);
    const second = page.getByRole("button", { name: "Edit Second owned saree", exact: true });
    await page.getByRole("button", { name: "Edit First owned saree", exact: true }).click();
    await page.getByLabel("Product title", { exact: true }).fill("First owned saree updated"); await expect(second).toBeDisabled();
    const held = state.holdNextPatch(); await page.getByRole("button", { name: "Save product details", exact: true }).click(); await held.started;
    await expect(second).toBeDisabled(); await expect(page.getByRole("button", { name: "+ Add product", exact: true })).toBeDisabled(); held.release();
    await expect(page.getByText("Product details saved.", { exact: true })).toBeVisible();
    // Regression: a saved editor previously kept every other Edit button disabled.
    await expect(second).toBeEnabled();
    await expect(page.getByRole("button", { name: "+ Add product", exact: true })).toBeEnabled();
    await second.scrollIntoViewIfNeeded();
    if (width === 1280) await assertWcagAA(page);
    if (process.env.TEST_STATE_DIRECTORY) {
      const path = join(process.env.TEST_STATE_DIRECTORY, `012-product-after-save-${width}.png`);
      await page.screenshot({ path, animations: "disabled" });
      chmodSync(path, 0o600);
    }
    await second.click(); await expect(page.getByLabel("Product title", { exact: true })).toHaveValue("Second owned saree");
    await page.getByLabel("Product title", { exact: true }).fill("Unsaved second saree");
    const first = page.getByRole("button", { name: "Edit First owned saree updated", exact: true }); await expect(first).toBeDisabled();
    await page.getByRole("button", { name: "Close editor", exact: true }).click(); await page.getByRole("button", { name: "Keep editing", exact: true }).click();
    await expect(page.getByLabel("Product title", { exact: true })).toHaveValue("Unsaved second saree"); state.failNextPatch();
    await page.getByRole("button", { name: "Save product details", exact: true }).click();
    await expect(page.getByText("Fixture save conflict. Retry or keep your changes.", { exact: true })).toBeVisible(); await expect(first).toBeDisabled();
    await expect(page.getByLabel("Product title", { exact: true })).toHaveValue("Unsaved second saree");
    await page.getByRole("button", { name: "Close editor", exact: true }).click(); await page.getByRole("button", { name: "Close without saving", exact: true }).click();
    await first.click(); await expect(page.getByLabel("Product title", { exact: true })).toHaveValue("First owned saree updated");
    expect(state.products[1].title).toBe("Second owned saree"); expect(state.changes).toEqual([`/api/v1/stores/${STORE}/products/${FIRST}`]); state.verify();
  });
}
test("creating a draft keeps its media editor available and permits editing another saved product", async ({ page }) => {
  const state = await fixture(page); await page.getByRole("button", { name: "+ Add product", exact: true }).click();
  await page.getByLabel("Product title", { exact: true }).fill("New owned saree"); await page.getByLabel("SKU / reference", { exact: true }).fill("NEW-OWNED");
  await page.getByRole("button", { name: "Create draft", exact: true }).click(); await expect(page.getByText("Product details saved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product photos & video.", exact: true })).toBeVisible();
  await expect(page.getByLabel("Product title", { exact: true })).toHaveValue("New owned saree");
  const other = page.getByRole("button", { name: "Edit Second owned saree", exact: true }); await expect(other).toBeEnabled(); await other.click();
  await expect(page.getByLabel("Product title", { exact: true })).toHaveValue("Second owned saree"); expect(state.changes).toHaveLength(1); state.verify();
});
