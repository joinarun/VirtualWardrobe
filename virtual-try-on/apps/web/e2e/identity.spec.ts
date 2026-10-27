import { test, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";

const freshPassword = () => `Ui-${randomUUID()}-aA9`;
async function saveStoreProfile(page: Page) {
  // Hold the genuine post-save session refresh so a duplicate local/global
  // announcement cannot disappear behind a quick component remount.
  let release!: () => void;
  let held = 0;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const pattern = "**/api/v1/auth/session";
  const hold = async (route: Route) => {
    const response = await route.fetch();
    held += 1;
    await gate;
    await route.fulfill({ response }).catch(() => {});
  };
  await page.route(pattern, hold);
  const success = page.getByText("Store profile saved.", { exact: true });
  try {
    await page.getByRole("button", { name: "Save store profile", exact: true }).click();
    await expect.poll(() => held).toBeGreaterThan(0);
    await expect(success).toHaveCount(1);
    await expect(success).toBeVisible();
  } finally {
    release();
    await page.unroute(pattern, hold);
  }
  await expect(page.getByRole("button", { name: "Save store profile", exact: true })).toBeEnabled();
  await expect(success).toHaveCount(1);
  await expect(success).toBeVisible();
}
async function signIn(
  page: Page,
  kind: "CUSTOMER" | "WORKFORCE",
  identifier: string,
  password: string,
) {
  await page.goto(kind === "WORKFORCE" ? "/staff/login" : "/account/login");
  await page
    .getByLabel(
      kind === "WORKFORCE"
        ? "Email address"
        : "Mobile number with country code",
    )
    .fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) =>
    kind === "WORKFORCE"
      ? url.pathname === "/staff" || url.pathname === "/account/password"
      : url.pathname === "/account",
  );
}
async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL("/");
}
async function rotatePassword(
  page: Page,
  oldPassword: string,
  nextPassword: string,
) {
  await expect(
    page.getByRole("heading", { name: "Choose a password of your own." }),
  ).toBeVisible();
  await page
    .getByLabel("Temporary password", { exact: true })
    .fill(oldPassword);
  await page.getByLabel("New password", { exact: true }).fill(nextPassword);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill(nextPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.waitForURL(/\/staff/);
}

test("customer signup, one-time recovery codes, recovery, login and deletion use the real backend", async ({
  page,
  context,
  browser,
}) => {
  const config = await page.request.get("/api/v1/auth/config");
  const settings = await config.json();
  test.skip(
    settings.captcha?.mode !== "LOCAL_TEST",
    "This disposable journey requires the explicitly configured local CAPTCHA adapter.",
  );
  const mobile = `92${Date.now().toString().slice(-8)}`;
  const phone = `+91${mobile}`;
  const password = freshPassword();
  const nextPassword = freshPassword();
  await page.goto("/account/signup");
  await page.getByLabel("Your name").fill("Disposable UI Customer");
  await page.getByLabel("Mobile number", { exact: true }).fill(mobile);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page
    .getByLabel("I have read and agree to the account privacy notice.")
    .check();
  await page
    .getByLabel("I am testing in the local development environment.")
    .check();
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(
    page.getByRole("heading", { name: "Keep a way back in." }),
  ).toBeVisible();
  const recoveryCodes = page
    .getByLabel("One-time recovery codes")
    .locator("code");
  expect(await recoveryCodes.count()).toBeGreaterThanOrEqual(5);
  const recoveryCode = await recoveryCodes.first().textContent();
  if (!recoveryCode) throw Error("Expected a recovery code to be shown once");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download recovery codes" }).click();
  expect((await download).suggestedFilename()).toBe(
    "virtual-wardrobe-recovery-codes.txt",
  );
  await page.getByLabel("I have saved my recovery codes securely.").check();
  await page.getByRole("button", { name: "Continue to my account" }).click();
  await expect(
    page.getByRole("heading", { name: "Hello, Disposable UI Customer." }),
  ).toBeVisible();
  await expect(
    page.getByText("Phone unverified", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  const cookie = (await context.cookies()).find(
    (item) => item.name === "__session",
  );
  expect(cookie?.httpOnly).toBeTruthy();
  expect(cookie?.sameSite).toBe("Lax");
  expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000 + 29 * 86400);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hello, Disposable UI Customer." })).toBeVisible();
  // Restore cookies only in memory to model a reopened browser; no secret state is exported.
  const reopened = await browser.newContext({ storageState: await context.storageState(), baseURL: process.env.BASE_URL || "http://localhost:5173" });
  try {
    const restored = await reopened.newPage();
    await restored.goto("/account");
    await expect(restored.getByRole("heading", { name: "Hello, Disposable UI Customer." })).toBeVisible();
  } finally { await reopened.close(); }
  await signOut(page);
  await page.goto("/account/recover");
  await page.getByLabel("Mobile number with country code").fill(phone);
  await page.getByLabel("Unused recovery code").fill(recoveryCode);
  await page.getByLabel("New password", { exact: true }).fill(nextPassword);
  await page.getByLabel("Confirm password", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(
    page.getByRole("heading", { name: "Your password is updated." }),
  ).toBeVisible();
  await signIn(page, "CUSTOMER", phone, nextPassword);
  await expect(
    page.getByRole("heading", { name: "Hello, Disposable UI Customer." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete my customer account" })
    .click();
  await page
    .getByLabel("Confirm your password", { exact: true })
    .fill(nextPassword);
  await page
    .getByLabel("I understand that my customer account will be deleted.")
    .check();
  await page
    .getByRole("button", { name: "Delete my account", exact: true })
    .click();
  await expect(
    page.getByText(
      "Your account deletion request was accepted and your session has ended.",
    ),
  ).toBeVisible();
});

test("workforce rotation, invitations, final-admin errors and staff boundaries use the real backend", async ({
  page,
}) => {
  test.setTimeout(120000);
  const bootstrap = process.env.TEST_BOOTSTRAP_FILE;
  const stateDirectory = process.env.TEST_STATE_DIRECTORY;
  test.skip(
    !bootstrap || !stateDirectory || !existsSync(bootstrap),
    "An operator-provided owner-only local bootstrap fixture is required; credentials are never embedded in tests.",
  );
  if (!bootstrap || !stateDirectory) return;
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  const stateFile = join(stateDirectory, "admin-credential.json");
  let operator: { email: string; password: string };
  if (existsSync(stateFile))
    operator = JSON.parse(readFileSync(stateFile, "utf8"));
  else {
    const content = readFileSync(bootstrap, "utf8");
    const email = content.match(/^Email:\s*(.+)$/m)?.[1]?.trim();
    const password = content
      .match(/^Temporary password:\s*(.+)$/m)?.[1]
      ?.trim();
    if (!email || !password)
      throw Error("Bootstrap fixture has an unsupported format");
    operator = { email, password };
  }
  await signIn(page, "WORKFORCE", operator.email, operator.password);
  await expect(page.getByRole("heading").first()).toBeVisible();
  if (
    await page
      .getByRole("heading", { name: "Choose a password of your own." })
      .isVisible()
  ) {
    const nextPassword = freshPassword();
    await rotatePassword(page, operator.password, nextPassword);
    operator.password = nextPassword;
    writeFileSync(stateFile, JSON.stringify(operator), { mode: 0o600 });
    chmodSync(stateFile, 0o600);
  }
  await expect(
    page.getByRole("button", { name: "+ Create store" }),
  ).toBeVisible();
  const suffix = randomUUID().slice(0, 8);
  const storeName = `Disposable UI Atelier ${suffix}`;
  const staffName = `UI Staff ${suffix}`;
  const staffEmail = `ui-staff-${suffix}@example.test`;
  await page.getByRole("button", { name: "+ Create store" }).click();
  await page.getByLabel("Store name", { exact: true }).fill(storeName);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Disposable browser acceptance store");
  await page.getByRole("button", { name: "Create pending store" }).click();
  await expect(
    page.getByRole("heading", { name: "Store profile." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Store team", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Super admin");
  await page.getByLabel("Email address", { exact: true }).fill(operator.email);
  await page.getByLabel("Store role").selectOption("STORE_ADMIN");
  await page
    .getByRole("button", { name: "Add team member", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Accept invitation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page
    .getByRole("button", { name: "Store profile", exact: true })
    .click();
  await page.getByLabel("Store status").selectOption("ACTIVE");
  await saveStoreProfile(page);
  await page.getByRole("button", { name: "Store team", exact: true }).click();
  const adminRow = page.getByRole("row").filter({ hasText: operator.email });
  await adminRow.getByRole("button", { name: /Remove/ }).click();
  await page
    .getByRole("button", { name: "Remove store access", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "final active store admin",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill(staffName);
  await page.getByLabel("Email address", { exact: true }).fill(staffEmail);
  await page.getByLabel("Store role").selectOption("STAFF");
  await page
    .getByRole("button", { name: "Add team member", exact: true })
    .click();
  const credential = page.getByRole("region", {
    name: "One-time temporary credential",
  });
  await expect(credential).toBeVisible();
  const temporaryPassword = await credential.locator("code").textContent();
  if (!temporaryPassword) throw Error("Expected one-time workforce credential");
  await signOut(page);
  await signIn(page, "WORKFORCE", staffEmail, temporaryPassword);
  const staffPassword = freshPassword();
  await rotatePassword(page, temporaryPassword, staffPassword);
  await expect(
    page.getByRole("button", { name: "Accept invitation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(
    page.getByRole("heading", { name: storeName, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Store team", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Store profile", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Platform workforce", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Platform catalog", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Products", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Add product", exact: true })
    .click();
  await page
    .getByLabel("Product title", { exact: true })
    .fill(`Staff draft ${suffix}`);
  await page
    .getByLabel("SKU / reference", { exact: true })
    .fill(`STAFF-${suffix}`);
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(
    page.getByText("Product details saved.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page.getByRole("button", { name: "Store brands", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Store brands.", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await signOut(page);
  await signIn(page, "WORKFORCE", operator.email, operator.password);
  await page.getByLabel("Current store").selectOption({ label: storeName });
  await page.getByRole("button", { name: "Store team", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: staffEmail })
    .getByRole("button", { name: /Remove/ })
    .click();
  await page
    .getByRole("button", { name: "Remove store access", exact: true })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: staffEmail }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Store profile", exact: true })
    .click();
  await page.getByLabel("Store status").selectOption("ARCHIVED");
  await saveStoreProfile(page);
});

test("UI only: disabled signup configuration never exposes a local CAPTCHA fallback", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/config", (route) =>
    route.fulfill({
      json: {
        signupEnabled: false,
        captcha: { mode: "DISABLED", action: "signup" },
        passwordMinLength: 12,
      },
    }),
  );
  await page.goto("/account/signup");
  await expect(
    page.getByText(/Self-signup is currently unavailable/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create my account" }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("I am testing in the local development environment."),
  ).toHaveCount(0);
});
