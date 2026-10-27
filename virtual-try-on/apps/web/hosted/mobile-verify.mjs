#!/usr/bin/env node
// Dedicated009 release smoke. Never uploads a photo or requests a generation.
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdtemp, chmod, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  TARGET, SafeFailure, requireCheck, assertSafeEnvironment, targetInventory,
  jsonFile, credentialBundle, actors, privateDirectory, writePrivate, safeFailure,
} from "./policy.mjs";

const WEB = fileURLToPath(new URL("../", import.meta.url));
const STATE = resolve(WEB, "../../work/gcp");
const THEMES = ["pearl", "sage", "midnight", "system"];
const MASK = "input,textarea,select,.recovery-codes,.credential-card,.staff-identity,.enquiry-contact,.detail-list,.customer-account h1,.event-actor,.event-transition,.enquiry-customer-context,.contact-phone,.wardrobe-card img,.private-preview-image img,img[src*='/private-media/']";
const ROOTS = { collection: ".catalog-home", product: ".product-detail", photo: ".tryon-page",
  previews: ".wardrobe-page", saved: ".wardrobe-page", account: ".customer-account" };
export function plan() {
  return {
    mode: "PLAN", project: TARGET.project, origin: TARGET.origin,
    network: false, credentialRead: false, newLiveJobs: 0,
    execution: "--run verifies real login, browser restart, mobile screens and themes; never uploads or generates",
    widths: [360, 390, 430, 844, 1280], themes: THEMES,
  };
}
export function allowedMutation(path, method) {
  return ["GET", "HEAD", "OPTIONS"].includes(method) ||
    (method === "POST" && ["/api/v1/auth/login", "/api/v1/auth/logout"].includes(path));
}
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function read(page, path) {
  const response = await page.request.get(`/api/v1${path}`, { maxRedirects: 0 });
  requireCheck(response.status() === 200, `READ_STATUS_${response.status()}`);
  requireCheck(/no-store/.test(response.headers()["cache-control"] || ""), "PRIVATE_CACHE_POLICY");
  return response.json();
}
async function screenshot(page, output, name) {
  const path = join(output, `${name}.png`);
  await page.screenshot({ path, mask: [page.locator(MASK)], animations: "disabled" });
  await chmod(path, 0o600);
}
async function screen(page, output, name, routeName) {
  await page.locator(ROOTS[routeName]).waitFor();
  await page.locator("main,#main-content").first().waitFor();
  await page.waitForFunction(() => !document.querySelector(".loading-state"));
  await page.waitForFunction(() => [...document.images].filter((image) => {
    const box = image.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.top < innerHeight && box.bottom > 0;
  }).every((image) => image.complete && image.naturalWidth > 0));
  requireCheck(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "HORIZONTAL_OVERFLOW");
  requireCheck(!await page.getByText(/gemini|nano banana|EVALUATION_DEMO|provider processing|disclosure version|AI-generated preview/i).count(), "TECHNICAL_CUSTOMER_COPY");
  await screenshot(page, output, name);
}
async function signIn(page, actor) {
  const customer = actor.kind === "CUSTOMER";
  await page.goto(customer ? "/account/login" : "/staff/login");
  await page.getByLabel(customer ? "Mobile number with country code" : "Email address", { exact: true }).fill(actor.identifier);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  const login = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/auth/login" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  requireCheck((await login).status() === 200, "LOGIN_FAILED");
  await page.locator(customer ? ".customer-account" : ".workspace-main").waitFor();
  requireCheck((await read(page, "/auth/session")).user?.id === actor.id, "WRONG_SESSION");
}
export async function main(args = process.argv.slice(2), environment = process.env) {
  const { values } = parseArgs({ args, options: {
    run: { type: "boolean", default: false },
    inventory: { type: "string", default: join(STATE, "deployment.json") },
    credentials: { type: "string", default: join(STATE, "demo-credentials-virtualwardrobe-demo-v1.json") },
  } });
  if (!values.run) { console.log(JSON.stringify(plan(), null, 2)); return 0; }
  assertSafeEnvironment(environment);
  const inventory = targetInventory(await jsonFile(values.inventory, true));
  const who = actors(credentialBundle(await jsonFile(values.credentials, true)));
  await privateDirectory(STATE);
  const output = await mkdtemp(join(STATE, "mobile-verification-"));
  await chmod(output, 0o700);
  const profile = await mkdtemp(join(STATE, "mobile-browser-"));
  await chmod(profile, 0o700);
  const journalPath = join(STATE, "hosted-live-job.json");
  const journalBefore = digest(await readFile(journalPath));
  const report = { schemaVersion: 1, revision: inventory.source_revision, origin: TARGET.origin,
    status: "RUNNING", startedAt: new Date().toISOString(), newLiveJobs: 0, uploads: 0,
    checks: [], screenshots: [], javascriptErrors: 0, blockedMutations: 0 };
  let context, phase = "LAUNCH";
  try {
    const { chromium } = await import("@playwright/test");
    const { default: AxeBuilder } = await import("@axe-core/playwright");
    const launch = async () => {
      const current = await chromium.launchPersistentContext(profile, {
        baseURL: TARGET.origin, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, headless: true, colorScheme: "light",
        executablePath: environment.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      });
      current.setDefaultTimeout(60000);
      current.setDefaultNavigationTimeout(60000);
      await current.route("**/api/v1/**", async (route) => {
        const request = route.request();
        if (!allowedMutation(new URL(request.url()).pathname, request.method())) {
          report.blockedMutations++;
          await route.abort();
        } else await route.continue();
      });
      current.on("page", (page) => page.on("pageerror", () => report.javascriptErrors++));
      return current;
    };
    context = await launch();
    let page = await context.newPage();
    report.browser = context.browser()?.version() || "CHROMIUM";
    phase = "LOGIN";
    await signIn(page, who.customer);
    const cookies = await context.cookies(TARGET.origin);
    const cookie = cookies.find((entry) => entry.name === "__session");
    requireCheck(cookie?.httpOnly && cookie.secure && cookie.sameSite === "Lax" && cookie.expires > Date.now() / 1000 + 28 * 86400, "PERSISTENT_SECURE_COOKIE_MISSING");
    report.checks.push("persistent_secure_customer_cookie");
    const before = await read(page, "/me/try-on/jobs");
    const beforeGallery = await read(page, "/me/try-on/gallery");
    phase = "BROWSER_RESTART";
    await context.close();
    context = await launch();
    page = await context.newPage();
    await page.goto("/account");
    await page.locator(".customer-account").waitFor();
    requireCheck((await read(page, "/auth/session")).user?.id === who.customer.id, "RESTART_LOST_LOGIN");
    report.checks.push("actual_browser_process_restart_keeps_login");
    phase = "MOBILE_LAYOUT_THEMES";
    const products = await (await page.request.get("/api/v1/products?size=30")).json();
    const product = products.items?.find((entry) => entry.tryOnEnabled && entry.availability === "AVAILABLE");
    requireCheck(product?.id, "TRYON_PRODUCT_UNAVAILABLE");
    const paths = [["collection", "/"], ["product", `/products/${product.id}`],
      ["photo", `/try-on?product=${product.id}`], ["previews", "/account/previews"],
      ["saved", "/account/gallery"], ["account", "/account"]];
    const accessibility = [];
    for (const width of [360, 390, 430, 844, 1280]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
      for (const [name, path] of paths) {
        phase = `SCREEN_${width}_${name.toUpperCase()}`;
        await page.goto(path);
        if (name === "photo") {
          await page.getByRole("button", { name: "Create my preview", exact: true }).waitFor();
          requireCheck(await page.locator('input[type="checkbox"]').count() === 0, "PHOTO_CHECKBOX_PRESENT");
          requireCheck(await page.locator('input[type="file"]').count() >= 1, "PHOTO_INPUT_MISSING");
        }
        await screen(page, output, `${width}-${name}-pearl`, name);
        report.screenshots.push(`${width}-${name}-pearl.png`);
        if (width <= 430) {
          const nav = page.getByRole("navigation", { name: "Mobile navigation", exact: true });
          requireCheck(await nav.isVisible(), "MOBILE_NAVIGATION_MISSING");
          for (const label of ["Collection", "Previews", "Saved", "Account"]) {
            const box = await nav.getByRole("link", { name: label, exact: true }).boundingBox();
            requireCheck(box?.width >= 44 && box.height >= 44, "MOBILE_NAV_TARGET_TOO_SMALL");
          }
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const theme of THEMES) {
      phase = `THEME_${theme.toUpperCase()}`;
      await page.goto("/");
      await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(theme);
      await page.reload();
      requireCheck(await page.locator("html").getAttribute("data-theme-preference") === theme, "THEME_RELOAD_FAILED");
      const resolved = theme === "system" ? "pearl" : theme;
      requireCheck(await page.locator("html").getAttribute("data-theme") === resolved, "THEME_NOT_APPLIED");
      for (const [name, path] of paths.filter(([name]) => ["collection", "photo", "saved", "account"].includes(name))) {
        await page.goto(path);
        await screen(page, output, `390-${name}-theme-${theme}`, name);
        report.screenshots.push(`390-${name}-theme-${theme}.png`);
        const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        accessibility.push({ theme, page: name, violations: result.violations.length,
          rules: result.violations.map((entry) => entry.id) });
        requireCheck(result.violations.length === 0, "ACCESSIBILITY_VIOLATION");
      }
    }
    report.accessibility = accessibility;
    report.checks.push("five_viewports_six_customer_pages", "four_themes_reload", "sixteen_accessibility_scans", "photo_flow_has_no_checkbox_or_technical_banner");
    phase = "RETURN_TO_APP";
    await page.goto("/account/previews");
    const other = await context.newPage();
    await other.goto("/privacy");
    await page.bringToFront();
    await page.evaluate(() => { window.dispatchEvent(new Event("pageshow")); window.dispatchEvent(new Event("online")); });
    await page.reload();
    requireCheck((await read(page, "/auth/session")).user?.id === who.customer.id, "RESUME_LOST_LOGIN");
    const after = await read(page, "/me/try-on/jobs");
    const afterGallery = await read(page, "/me/try-on/gallery");
    requireCheck(JSON.stringify(before) === JSON.stringify(after) && JSON.stringify(beforeGallery) === JSON.stringify(afterGallery), "READONLY_JOURNEY_CHANGED_PREVIEWS");
    requireCheck(report.blockedMutations === 0, "UNEXPECTED_CUSTOMER_MUTATION");
    requireCheck(report.javascriptErrors === 0, "BROWSER_JAVASCRIPT_ERROR");
    requireCheck(digest(await readFile(journalPath)) === journalBefore, "PAID_JOURNAL_CHANGED");
    report.checks.push("foreground_reload_keeps_login", "jobs_and_gallery_unchanged", "old_paid_journal_unchanged", "zero_new_uploads_or_jobs");
    phase = "LOGOUT";
    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    requireCheck((await read(page, "/auth/session")).user === null, "LOGOUT_FAILED");
    report.checks.push("explicit_logout_revokes_session");
    phase = "WORKFORCE_RESTART_THEME";
    await signIn(page, who.staff);
    await context.close();
    context = await launch();
    page = await context.newPage();
    await page.goto("/staff");
    await page.locator(".workspace-main").waitFor();
    requireCheck((await read(page, "/auth/session")).user?.id === who.staff.id, "WORKFORCE_RESTART_LOST_LOGIN");
    report.staffAccessibility = [];
    for (const theme of ["pearl", "sage", "midnight"]) {
      await page.getByRole("combobox", { name: "Appearance", exact: true }).selectOption(theme);
      await page.reload();
      await page.locator(".workspace-main").waitFor();
      requireCheck(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "WORKFORCE_HORIZONTAL_OVERFLOW");
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      report.staffAccessibility.push({ theme, violations: result.violations.length, rules: result.violations.map((entry) => entry.id) });
      requireCheck(result.violations.length === 0, "WORKFORCE_ACCESSIBILITY_VIOLATION");
      await screenshot(page, output, `390-workspace-${theme}`);
      report.screenshots.push(`390-workspace-${theme}.png`);
    }
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    requireCheck((await read(page, "/auth/session")).user === null, "WORKFORCE_LOGOUT_FAILED");
    report.checks.push("workforce_browser_restart", "three_workforce_theme_accessibility_scans");
    requireCheck(report.blockedMutations === 0 && report.javascriptErrors === 0, "FINAL_BROWSER_GUARD_FAILED");
    requireCheck(digest(await readFile(journalPath)) === journalBefore, "PAID_JOURNAL_CHANGED");
    report.status = "PASSED";
  } catch (error) {
    report.status = "FAILED";
    report.failure = { phase, code: error instanceof SafeFailure ? error.code : safeFailure(error) };
  } finally {
    if (context) await context.close().catch(() => {});
    await rm(profile, { recursive: true, force: true });
    report.completedAt = new Date().toISOString();
    await writePrivate(join(output, "receipt.json"), report);
  }
  console.log(JSON.stringify(report, null, 2));
  return report.status === "PASSED" ? 0 : 1;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then((code) => { process.exitCode = code; }).catch(() => {
    console.log(JSON.stringify({ status: "FAILED", code: "MOBILE_VERIFICATION_FAILED" }));
    process.exitCode = 1;
  });
}
