import { test, expect } from "@playwright/test";
import { join } from "node:path";

test("mobile navigation keeps the document, browser back and unsent photo choice", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const user = { id: "10000000-0000-0000-0000-000000000001", kind: "CUSTOMER", name: "Navigation UI fixture", enabled: true, superAdmin: false, passwordChangeRequired: false, memberships: [] };
  await page.route("**/api/v1/auth/session", (route) => route.fulfill({ json: { user } }));
  let mutations = 0;
  await page.route("**/api/v1/me/**", (route) => {
    if (route.request().method() !== "GET") { mutations += 1; return route.abort(); }
    if (new URL(route.request().url()).pathname.endsWith("/quota"))
      return route.fulfill({ json: { used: 0, remaining: 3, limit: 3, saved: 0, savedLimit: 100, resetsAt: new Date(Date.now() + 86400000).toISOString() } });
    return route.fulfill({ json: { items: [], page: 0, size: 12, total: 0 } });
  });
  await page.goto("/");
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page.evaluate(() => { (globalThis as typeof globalThis & { navigationFixture: boolean }).navigationFixture = true; });
  const bottom = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
  await bottom.getByRole("link", { name: "Saved", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/gallery$/);
  await expect(page.getByRole("heading", { name: "A gallery that stays yours." })).toBeVisible();
  expect(await page.evaluate(() => Boolean((globalThis as typeof globalThis & { navigationFixture: boolean }).navigationFixture))).toBeTruthy();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".product-card").first()).toBeVisible();
  await page.locator(".card-tryon").first().click();
  await expect(page.getByRole("heading", { name: "See yourself in it." })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(join(process.cwd(), "public/demo/hero-emerald-small.jpg"));
  await expect(page.locator(".person-photo-zone img")).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await bottom.getByRole("link", { name: "Collection", exact: true }).click();
  await expect(page).toHaveURL(/\/try-on\?product=/);
  await expect(page.locator(".person-photo-zone img")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await bottom.getByRole("link", { name: "Saved", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/gallery$/);
  expect(mutations).toBe(0);
  expect(await page.evaluate(() => Boolean((globalThis as typeof globalThis & { navigationFixture: boolean }).navigationFixture))).toBeTruthy();
});
