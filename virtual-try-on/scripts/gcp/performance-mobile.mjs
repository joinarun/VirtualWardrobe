#!/usr/bin/env node
// Anonymous mobile browsing only. No credentials, screenshots of accounts or AI calls.
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const profile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  cpuSlowdown: 4, downloadMbps: 9, uploadMbps: 1.6, latencyMs: 150,
  browserCache: "disabled", backend: "five ordinary API reads before browser timing", usableLimitMs: 3000,
  usableDefinition: "Search is enabled; a product title, price and first product image are decoded and painted after immediate scrolling to the collection" };

export function validCatalogTotal(value) {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 1000;
}
export function mobileMeasurementPasses(rawMs, javascriptErrors) {
  return typeof rawMs === "number" && Number.isFinite(rawMs) && rawMs >= 0 && rawMs <= 3000 && javascriptErrors === 0;
}
export function mobilePlan(count = 5) {
  return { profile, runs: count, mutations: false };
}

export async function main(argv = process.argv.slice(2)) {
const { values } = parseArgs({ args: argv, options: {
  run: { type: "boolean", default: false },
  inventory: { type: "string", default: resolve(root, "work/gcp/deployment.json") },
  runs: { type: "string", default: "5" },
} });
const count = Number(values.runs);
if (!Number.isInteger(count) || count < 3 || count > 7) throw new Error("Use 3–7 fresh browser runs");

if (!values.run) {
  console.log(JSON.stringify(mobilePlan(count), null, 2));
  return 0;
}
const inventory = JSON.parse(await readFile(values.inventory, "utf8"));
if (inventory.project_id !== "virtualtryon-511016" || inventory.web_url !== "https://virtualwardrobe-511016.web.app") {
  throw new Error("The intended VirtualWardrobe Hosting inventory is required");
}
const apiTarget = new URL(inventory.api_url);
if (inventory.environment !== "demo" || inventory.region !== "asia-south1" || apiTarget.protocol !== "https:" ||
    !/^virtualwardrobe-demo-api-[a-z0-9.-]+\.run\.app$/.test(apiTarget.hostname) ||
    apiTarget.username || apiTarget.password || apiTarget.port || !["", "/"].includes(apiTarget.pathname) || apiTarget.search || apiTarget.hash) {
  throw new Error("The intended deployed API URL is required");
}
const require = createRequire(resolve(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
for (const path of ["products?size=1", "categories", "brands", "products?size=24", "products?q=saree&size=24"]) {
  const response = await fetch(inventory.api_url + "/api/v1/" + path, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error("API warm-up failed; no mobile performance claim made");
  await response.arrayBuffer();
}
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const results = [];
const output = resolve(root, "work/gcp");
await mkdir(output, { recursive: true, mode: 0o700 });
try {
  for (let index = 0; index < count; index++) {
    const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.setCacheDisabled", { cacheDisabled: true });
    await client.send("Network.emulateNetworkConditions", { offline: false, latency: 150,
      downloadThroughput: 9_000_000 / 8, uploadThroughput: 1_600_000 / 8, connectionType: "cellular4g" });
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    let errors = 0;
    page.on("pageerror", () => errors++);
    const result = { run: index + 1, passed: false };
    try {
      const catalog = page.waitForResponse(response => new URL(response.url()).pathname === "/api/v1/products" && response.status() === 200);
      const [, catalogResponse] = await Promise.all([page.goto(inventory.web_url + "/", { waitUntil: "domcontentloaded", timeout: 60_000 }), catalog]);
      const payload = await catalogResponse.json();
      if (!validCatalogTotal(payload.total)) throw new Error("Performance dataset missing or invalid");
      await page.locator("#catalog-query").waitFor({ state: "visible", timeout: 30_000 });
      if (!await page.locator("#catalog-query").isEnabled()) throw new Error("Search unavailable");
      const first = page.locator(".product-card").first();
      await first.locator("h3").waitFor({ state: "visible", timeout: 30_000 });
      await first.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const card = document.querySelector(".product-card");
        const image = card?.querySelector("img");
        return !!image && image.complete && image.naturalWidth > 0 && !!card.querySelector(".product-price-row strong")?.textContent;
      }, null, { timeout: 30_000 });
      result.usableRawMs = await page.evaluate(async () => {
        const image = document.querySelector(".product-card img");
        if (!(image instanceof HTMLImageElement)) throw new Error("Product image unavailable");
        await image.decode();
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
        if (!image.isConnected || !image.complete || image.naturalWidth <= 0) throw new Error("Product image changed before paint");
        return performance.now();
      });
      result.usableMs = Math.round(result.usableRawMs);
      result.catalogRows = payload.total;
      const response = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === "/api/v1/products" && url.searchParams.get("q") === "silk" && response.status() === 200;
      });
      await page.locator("#catalog-query").fill("silk");
      const searchStart = await page.evaluate(() => performance.now());
      await page.locator("#catalog-query").press("Enter");
      await response;
      await page.getByLabel("Loading products").waitFor({ state: "hidden", timeout: 30_000 });
      result.searchMs = Math.round(await page.evaluate(() => performance.now()) - searchStart);
      result.javascriptErrors = errors;
      result.passed = mobileMeasurementPasses(result.usableRawMs, errors);
      if (index === 0) await page.screenshot({ path: resolve(output, "performance-mobile.png") });
    } catch {
      result.failure = "Browse readiness or profile check failed; request/response bodies and URLs withheld";
      result.javascriptErrors = errors;
    } finally {
      results.push(result);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const report = { projectId: inventory.project_id, sourceRevision: inventory.source_revision,
  measuredAt: new Date().toISOString(), profile, browserVersion: browser.version(), results,
  passed: results.every(result => result.passed),
  limitation: "Synthetic Chromium profile from the operator workstation; backend warmed, browser cache empty. Not a field-user percentile or a cold-start result." };
await writeFile(resolve(output, "performance-mobile.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
return report.passed ? 0 : 1;

}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main();
}
