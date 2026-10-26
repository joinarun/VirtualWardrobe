import { test, expect } from "@playwright/test";
import { assertWcagAA } from "./contrast";
import { join } from "node:path";
test("customer catalog and sign-in meet automated WCAG A/AA checks", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/account/login",
    "/staff/login",
    "/account/signup",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await assertWcagAA(page);
  }
  let mode = "EVALUATION_DEMO";
  await page.route("**/api/v1/try-on/config", (route) =>
    route.fulfill({
      json: {
        mode,
        label: "Evaluation demo from service",
        notice:
          "Provider evaluation notice from the current server configuration.",
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByLabel("Fictional demo disclosure")).toContainText(
    "Evaluation demo from service",
  );
  await expect(page.getByLabel("Fictional demo disclosure")).toContainText(
    "Provider evaluation notice from the current server configuration.",
  );
  await assertWcagAA(page);
  mode = "LIVE";
  const liveConfig = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/try-on/config"),
  );
  await page.reload();
  await liveConfig;
  await expect(page.getByLabel("Fictional demo disclosure")).toHaveCount(0);
});

test.describe("high-density mobile rendering", () => {
  test.use({ deviceScaleFactor: 2 });
  test("mobile storefront uses local fonts, compact JPEG and a keyboard content shortcut", async ({
    page,
  }) => {
    const externalFonts: string[] = [];
    page.on("request", (request) => {
      if (/fonts\.(googleapis|gstatic)\.com/.test(request.url()))
        externalFonts.push(request.url());
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const hero = page.locator(".catalog-hero-image img");
    await expect
      .poll(() =>
        hero.evaluate(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
      )
      .toBeTruthy();
    const current = await hero.evaluate(
      (image) => (image as HTMLImageElement).currentSrc,
    );
    expect(new URL(current).pathname).toBe("/demo/hero-emerald-small.jpg");
    const bytes = await page.request.get(current);
    expect((await bytes.body()).length).toBeLessThan(100000);
    await page.evaluate(() => document.fonts.ready);
    expect(externalFonts).toEqual([]);
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    if (process.env.TEST_STATE_DIRECTORY)
      await page.screenshot({
        path: join(
          process.env.TEST_STATE_DIRECTORY,
          "storefront-mobile-polish.png",
        ),
      });
  });
});
