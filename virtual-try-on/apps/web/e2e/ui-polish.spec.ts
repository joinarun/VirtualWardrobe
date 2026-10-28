import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { assertWcagAA } from "./contrast";

// Public, owned-image UI fixtures. No sign-in, backend mutation or model call.
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const STORE = "55555555-5555-4555-8555-555555555555";
async function fixtures(page: Page) {
  let mutations = 0;
  await page.route("**/api/v1/**", (route) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
      mutations += 1;
      return route.abort();
    }
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/session") return route.fulfill({ json: { user: null } });
    if (path === "/api/v1/auth/config") return route.fulfill({ json: { signupEnabled: true, passwordMinLength: 12, captcha: { mode: "LOCAL_TEST", action: "signup" } } });
    if (path === "/api/v1/stores") return route.fulfill({ json: { items: [{ id: STORE, name: "Owned UI fixture store", status: "ACTIVE" }] } });
    if (["/api/v1/categories", "/api/v1/brands"].includes(path)) return route.fulfill({ json: { items: [] } });
    if (path === "/api/v1/products") return route.fulfill({ json: { items: [{
      id: PRODUCT, storeId: STORE, storeName: "Owned UI fixture store", title: "Owned ruby saree",
      fabric: "Silk", colour: "Ruby", price: "2500.00", currency: "INR", size: "Free size", labels: [],
      status: "PUBLISHED", availability: "AVAILABLE", tryOnEnabled: true, coverUrl: "/demo/saree-ruby.png",
    }], page: 0, size: 12, total: 30 } });
    return route.fulfill({ status: 404, json: { code: "UI_FIXTURE_ROUTE" } });
  });
  return () => expect(mutations).toBe(0);
}
async function openCollection(page: Page) {
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(1);
  await page.locator(".product-image-link img").evaluate((image) => (image as HTMLImageElement).decode());
  await page.evaluate(() => document.fonts.ready);
}
async function capture(page: Page, name: string) {
  if (!process.env.TEST_STATE_DIRECTORY) return;
  const path = join(process.env.TEST_STATE_DIRECTORY, `${name}.png`);
  await page.screenshot({ path, animations: "disabled" });
  await chmod(path, 0o600);
}
test.beforeAll(() => {
  expect(["localhost", "127.0.0.1", "web"]).toContain(new URL(process.env.BASE_URL || "http://localhost:5173").hostname);
});

test("appearance is one compact native palette control at every width", async ({ page }) => {
  const readOnly = await fixtures(page);
  for (const width of [360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await openCollection(page);
    const picker = page.getByRole("combobox", { name: "Appearance", exact: true });
    const box = await page.locator(".appearance-control").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(44);
    expect(box!.height).toBe(44);
    await expect(page.locator(".appearance-icon")).toBeVisible();
    const label = await page.locator(".appearance-label").boundingBox();
    expect(label!.width).toBeLessThanOrEqual(1);
    expect(await picker.locator("option").allTextContents()).toEqual(["Pearl", "Sage", "Midnight", "System"]);
    for (const choice of ["pearl", "sage", "midnight", "system"]) {
      await picker.selectOption(choice);
      await expect(page.locator("html")).toHaveAttribute("data-theme-preference", choice);
    }
  }
  const picker = page.getByRole("combobox", { name: "Appearance", exact: true });
  await picker.focus();
  await picker.press("p");
  await picker.press("Enter");
  await page.keyboard.press("Escape");
  await expect(picker).toHaveValue("pearl");
  await expect(picker).toBeFocused();
  await picker.selectOption("midnight");
  await assertWcagAA(page);
  await capture(page, "010-palette-desktop");
  readOnly();
});

test("collection header omits the product-count discovery copy", async ({ page }) => {
  const readOnly = await fixtures(page);
  for (const width of [360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await openCollection(page);
    await expect(page.locator(".collection-title")).not.toContainText(/30|pieces? to discover/i);
    await expect(page.locator(".collection-title > p")).toHaveCount(0);
  }
  readOnly();
});

for (const width of [360, 390, 430, 1280]) {
  test(`Filters and sort share both edges at ${width}px, open or closed`, async ({ page }) => {
    const readOnly = await fixtures(page);
    await page.setViewportSize({ width, height: 1000 });
    await openCollection(page);
    const details = page.locator(".catalog-filters"), summary = details.locator("summary");
    for (const expanded of [false, true]) {
      if (await details.evaluate((element) => (element as HTMLDetailsElement).open) !== expanded)
        await summary.click();
      await expect(details).toHaveJSProperty("open", expanded);
      const filter = await summary.boundingBox(), sort = await page.getByLabel("Sort by", { exact: true }).boundingBox();
      expect(Math.abs(filter!.y - sort!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(filter!.y + filter!.height - sort!.y - sort!.height)).toBeLessThanOrEqual(1);
      expect(filter!.height).toBeGreaterThanOrEqual(44);
      expect(sort!.height).toBeGreaterThanOrEqual(44);
      if (expanded) await expect(page.getByLabel("Category", { exact: true })).toBeVisible();
      else await expect(page.getByLabel("Category", { exact: true })).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
    }
    await summary.click();
    await assertWcagAA(page);
    await capture(page, `010-catalog-${width}`);
    readOnly();
  });
}

test("desktop sign-in shows the complete undistorted editorial photo", async ({ page }) => {
  const readOnly = await fixtures(page);
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/account/login");
    const image = page.locator(".auth-story img");
    await image.evaluate((element) => (element as HTMLImageElement).decode());
    const geometry = await image.evaluate((element) => {
      const image = element as HTMLImageElement, style = getComputedStyle(image), box = image.getBoundingClientRect();
      return { fit: style.objectFit, position: style.objectPosition, borderRadius: style.borderTopLeftRadius,
        naturalRatio: image.naturalWidth / image.naturalHeight, frameRatio: box.width / box.height };
    });
    expect(geometry.fit).toBe("contain");
    expect(Math.abs(geometry.naturalRatio - geometry.frameRatio)).toBeLessThan(.02);
    expect(geometry.borderRadius).not.toContain("%");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
    await assertWcagAA(page);
    await capture(page, `010-login-${width}`);
  }
  readOnly();
});
