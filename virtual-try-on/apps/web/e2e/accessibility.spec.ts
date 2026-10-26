import { test, expect } from "@playwright/test";
import { assertTextContrast } from "./contrast";
test("customer catalog and sign-in text meets measured WCAG AA contrast", async ({
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
    await assertTextContrast(page);
  }
});
