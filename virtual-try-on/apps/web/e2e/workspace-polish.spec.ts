import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { assertWcagAA } from "./contrast";

const STORE = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
// Controlled local workspace data. No real account, upload or generation request.
async function workspace(page: Page, superAdmin = true) {
  let mutations = 0;
  await page.route("**/api/v1/**", (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      mutations++;
      return route.abort();
    }
    if (path === "/api/v1/auth/session") return route.fulfill({ json: { user: {
      id: "33333333-3333-4333-8333-333333333333", kind: "WORKFORCE", name: "Owned workspace reviewer",
      email: "reviewer@wardrobe.test", enabled: true, superAdmin, passwordChangeRequired: false,
      memberships: [{ membershipId: MEMBER, storeId: STORE, storeName: "Owned UI store", role: "STORE_ADMIN", state: "ACTIVE" }],
    } } });
    if (path === "/api/v1/auth/config") return route.fulfill({ json: { signupEnabled: false, passwordMinLength: 12, captcha: { mode: "DISABLED" } } });
    if (path === "/api/v1/stores") return route.fulfill({ json: { items: [{ id: STORE, name: "Owned UI store", description: "Owned test fixture", status: "ACTIVE", contactPhone: "", logoUrl: "" }] } });
    if (path.endsWith("/enquiries/counts")) return route.fulfill({ json: { unassignedNew: 0, totalActive: 0 } });
    if (path.endsWith("/members")) return route.fulfill({ json: { items: [{ id: MEMBER, userId: "44444444-4444-4444-8444-444444444444", name: "Owned invited staff", email: "staff@wardrobe.test", role: "STAFF", state: "INVITED" }] } });
    // Supply the old banner payload so its removal is exercised even in demo mode.
    if (path === "/api/v1/try-on/config") return route.fulfill({ json: { mode: "EVALUATION_DEMO", label: "AI-generated preview", notice: "AI EVALUATION DEMO. The 40-pair human saree quality review is pending." } });
    return route.fulfill({ status: 404, json: { code: "UI_FIXTURE_NOT_FOUND" } });
  });
  await page.goto("/staff");
  await expect(page.locator(".workspace-main")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return () => expect(mutations).toBe(0);
}
async function capture(page: Page, name: string) {
  if (!process.env.TEST_STATE_DIRECTORY) return;
  const path = join(process.env.TEST_STATE_DIRECTORY, `${name}.png`);
  await page.screenshot({ path, animations: "disabled" });
  await chmod(path, 0o600);
}
async function assertLayoutWidth(page: Page) {
  const layout = await page.evaluate(() => ({
    // WebKit rounds existing workspace painted width360 to scrollWidth361,
    // both before and after the popup opens. No element may actually overflow.
    paintedWidth: document.documentElement.scrollWidth,
    viewport: innerWidth,
    overflow: [...document.querySelectorAll("body *")].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && (box.left < -.1 || box.right > innerWidth + .1);
    }).length,
  }));
  expect(layout.paintedWidth).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.overflow).toBe(0);
}
test.use({ hasTouch: true });
test.beforeAll(() => expect(["localhost", "127.0.0.1", "web"]).toContain(new URL(process.env.BASE_URL || "http://localhost:5173").hostname));

test("membership edit fields align with their invitation hint", async ({ page }) => {
  const readOnly = await workspace(page);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.getByRole("button", { name: "Store team", exact: true }).click();
    await page.getByRole("button", { name: "Edit Owned invited staff", exact: true }).click();
    const role = page.locator("#edit-role"), state = page.locator("#edit-membership-state");
    await expect(role).toBeVisible(); await expect(state).toBeVisible();
    const a = await role.boundingBox(), b = await state.boundingBox();
    expect(a!.height).toBeGreaterThanOrEqual(44); expect(b!.height).toBeGreaterThanOrEqual(44);
    if (width >= 768) {
      expect(Math.abs(a!.y - b!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(a!.height - b!.height)).toBeLessThanOrEqual(1);
    }
    await expect(page.getByText("An invitation must still be accepted by the recipient.", { exact: true })).toBeVisible();
    await assertLayoutWidth(page);
    await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption("midnight");
    await assertWcagAA(page);
    if (width === 1280) {
      for (const theme of ["pearl", "sage", "midnight"]) {
        await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(theme);
        await assertWcagAA(page);
      }
    }
    await capture(page, `012-team-${width}`);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Overview", exact: true }).click();
  }
  readOnly();
});

test("store status help explains all states and supports keyboard and touch", async ({ page }) => {
  const readOnly = await workspace(page);
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.getByRole("button", { name: "Store profile", exact: true }).click();
    // The help label must not make the exact store-status control ambiguous.
    const status = page.getByLabel("Store status", { exact: true });
    await expect(status).toHaveCount(1);
    await status.selectOption("PENDING");
    await expect(status).toHaveValue("PENDING");
    await status.selectOption("ACTIVE");
    await expect(status).toHaveValue("ACTIVE");
    const help = page.getByRole("button", { name: "About store status", exact: true });
    await expect(help).toBeVisible();
    const bounds = await help.boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(44); expect(bounds!.width).toBeGreaterThanOrEqual(44);
    await help.focus(); await help.press("Enter");
    const popup = page.getByRole("tooltip");
    await expect(popup).toBeVisible();
    await expect(popup).toContainText("Pending"); await expect(popup).toContainText("Active"); await expect(popup).toContainText("Archived");
    await expect(popup).toContainText("accepts"); await expect(popup).toContainText("Store status to Active"); await expect(popup).toContainText("new customer requests");
    const popupBounds = await popup.boundingBox();
    expect(popupBounds!.x).toBeGreaterThanOrEqual(-.1);
    expect(popupBounds!.x + popupBounds!.width).toBeLessThanOrEqual(width + .1);
    await assertLayoutWidth(page);
    for (const theme of ["pearl", "sage", "midnight"]) {
      await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(theme);
      await assertWcagAA(page);
    }
    await capture(page, `012-status-help-${width}`);
    await help.press("Escape"); await expect(popup).toBeHidden(); await expect(help).toBeFocused();
    if (width === 360) {
      await help.tap(); await expect(popup).toBeVisible(); await help.tap();
    } else {
      await help.click(); await expect(popup).toBeVisible(); await help.click();
    }
    await expect(popup).toBeHidden();
    await page.getByRole("button", { name: "Overview", exact: true }).click();
  }
  readOnly();
});

test("workspace never renders the removed demo and evaluation banner", async ({ page }) => {
  const readOnly = await workspace(page);
  for (const route of ["Overview", "Store profile", "Store team"]) {
    await page.getByRole("button", { name: route, exact: true }).click();
    await expect(page.locator(".demo-notice")).toHaveCount(0);
    await expect(page.getByText(/Fictional demo\.|AI EVALUATION DEMO|40-pair human saree quality review|fit guarantee/)).toHaveCount(0);
  }
  readOnly();
});
