import { test, expect } from "@playwright/test";
import { assertWcagAA } from "./contrast";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TryOnJob } from "../src/tryon-types";
const baseURL = process.env.BASE_URL || "http://localhost:5173";

test("UI only: preview actions stay together and confirmations remain reachable", async ({ page }) => {
  test.setTimeout(60000);
  const jobId = "11111111-1111-4111-8111-111111111111";
  const productId = "22222222-2222-4222-8222-222222222222";
  const mediaId = "33333333-3333-4333-8333-333333333333";
  const createdAt = "2026-10-27T00:00:00Z";
  const snapshot = { id: productId, title: "Owned preview fixture saree", sku: "PREVIEW-UI", storeId: "55555555-5555-4555-8555-555555555555", storeName: "Owned fixture store", price: "2500.00", currency: "INR" as const };
  const result = { id: mediaId, imageUrl: `/api/v1/private-media/${mediaId}/content`, downloadUrl: `/api/v1/private-media/${mediaId}/download`, expiresAt: "2099-01-01T00:00:00Z", saved: false, saving: false };
  let job: TryOnJob = { id: jobId, productId, product: snapshot, state: "SUCCEEDED", createdAt, updatedAt: createdAt, deadlineAt: createdAt, attempts: 1, provider: "fixture", model: "fixture", demo: true, evaluationDemo: false, label: "Sample", notice: "Owned UI fixture", discarded: false, error: null, result, canCancel: false, canSave: true, canDiscard: true };
  const mutations: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      mutations.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 500, json: { code: "UI_MUTATION_UNEXPECTED" } });
    }
    if (path === "/api/v1/auth/session") return route.fulfill({ json: { user: { id: "44444444-4444-4444-8444-444444444444", name: "Preview fixture", kind: "CUSTOMER", phone: "+919000000009", phoneVerified: false, enabled: true, superAdmin: false, passwordChangeRequired: false, memberships: [] } } });
    if (path === `/api/v1/me/try-on/jobs/${jobId}`) return route.fulfill({ json: job });
    if (path === `/api/v1/products/${productId}`) return route.fulfill({ json: { ...snapshot, status: "PUBLISHED", availability: "AVAILABLE" } });
    if (path === `/api/v1/private-media/${mediaId}/content`) return route.fulfill({ contentType: "image/png", body: readFileSync(join(process.cwd(), "public/demo/saree-rose.png")) });
    return route.fulfill({ status: 404, json: { code: "UI_FIXTURE_UNAVAILABLE" } });
  });
  for (const width of [360, 390, 430, 620, 767, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const saved of [false, true]) {
      job = { ...job, result: { ...result, saved }, canSave: !saved };
      await page.goto(`/account/previews/${jobId}`);
      const actions = page.getByRole("group", { name: "Preview actions", exact: true });
      await expect(actions.locator(":scope > *")).toHaveCount(3);
      await expect(actions.getByRole(saved ? "link" : "button", { name: saved ? "Open saved gallery" : "Save to my gallery", exact: true })).toBeVisible();
      await expect(actions.getByRole("link", { name: "Download preview", exact: true })).toHaveAttribute("href", result.downloadUrl);
      const discard = actions.getByRole("button", { name: saved ? "Delete this preview" : "Discard this request", exact: true });
      await expect(discard).toHaveClass(/secondary-button/);
      await expect(discard).not.toHaveClass(/text-button/);
      await expect(page.getByText(/^(Requested|Available until)$/)).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Buy it", exact: true })).toHaveAttribute("href", `/callback?product=${productId}`);
      for (const action of await actions.locator(":scope > *").all()) {
        const bounds = await action.boundingBox();
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        if (width <= 767) {
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        }
      }
      if (!saved && [360, 1280].includes(width) && process.env.TEST_STATE_DIRECTORY) {
        const path = join(process.env.TEST_STATE_DIRECTORY, `010-preview-actions-${width}.png`);
        await page.screenshot({ path, animations: "disabled" });
        chmodSync(path, 0o600);
      }
      await discard.click();
      const confirmation = page.getByRole("region", { name: "Delete this preview?", exact: true });
      await expect(confirmation).toBeFocused();
      await expect(page.getByRole("button", { name: "Confirm discard", exact: true })).toBeInViewport({ ratio: 1 });
      await page.getByRole("button", { name: "Confirm discard", exact: true }).click({ trial: true });
      if (!saved && width === 360 && process.env.TEST_STATE_DIRECTORY) {
        const path = join(process.env.TEST_STATE_DIRECTORY, "010-preview-confirmation-360.png");
        await page.screenshot({ path, animations: "disabled" });
        chmodSync(path, 0o600);
      }
      // Opening and keeping a confirmation must never submit a destructive request.
      await page.getByRole("button", { name: "Keep request", exact: true }).click();
      await expect(confirmation).toHaveCount(0);
      await expect(discard).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBeFalsy();
      if (width === 360) await assertWcagAA(page);
    }
  }
  job = { ...job, state: "FAILED", result: null, canSave: false };
  await page.goto(`/account/previews/${jobId}`);
  const discard = page.getByRole("button", { name: "Discard this request", exact: true });
  await expect(discard).toHaveClass(/secondary-button/);
  await discard.click();
  await expect(page.getByRole("button", { name: "Confirm discard", exact: true })).toBeInViewport();
  expect(mutations).toEqual([]);
});
async function mutate(
  page: Page,
  path: string,
  method: string,
  body: unknown = {},
) {
  const security = await (await page.request.get("/api/v1/auth/csrf")).json();
  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    data: body,
    headers: { [security.headerName]: security.token },
  });
  if (!response.ok())
    throw Error(
      `Acceptance ${method} ${path} failed with ${response.status()}`,
    );
  return response.status() === 204 || response.status() === 202
    ? null
    : response.json();
}
async function signup(page: Page, name: string) {
  const phone = `+9193${Date.now().toString().slice(-8)}`;
  const password = `Try-${randomUUID()}-aA9`;
  await mutate(page, "/auth/signup", "POST", {
    name,
    countryCode: "+91",
    mobile: phone.slice(3),
    password,
    privacyAccepted: true,
    captchaToken: "local-development",
  });
  return { phone, password };
}

test("real photo action, idempotent job, download, gallery persistence and owner isolation", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const stateDirectory = process.env.TEST_STATE_DIRECTORY;
  const fixture =
    stateDirectory && join(stateDirectory, "admin-credential.json");
  test.skip(
    !fixture || !existsSync(fixture),
    "An owner-only operator fixture is required; no credentials are embedded in tests.",
  );
  if (!fixture) return;
  const operator = JSON.parse(readFileSync(fixture, "utf8"));
  const workforceContext = await browser.newContext({ baseURL });
  const ownerContext = await browser.newContext({ baseURL });
  const strangerContext = await browser.newContext({ baseURL });
  const anonymousContext = await browser.newContext({ baseURL });
  const admin = await workforceContext.newPage(),
    page = await ownerContext.newPage(),
    stranger = await strangerContext.newPage(),
    anonymous = await anonymousContext.newPage();
  const authConfig = await (
    await page.request.get("/api/v1/auth/config")
  ).json();
  const configResponse = await page.request.get("/api/v1/try-on/config");
  const config = await configResponse.json();
  test.skip(
    authConfig.captcha?.mode !== "LOCAL_TEST" || config.mode !== "FIXTURE",
    "This journey uses an explicit local fixture and never makes paid provider calls.",
  );
  let storeId: string | undefined,
    owner: { phone: string; password: string } | undefined,
    outsider: { phone: string; password: string } | undefined;
  try {
    await mutate(admin, "/auth/login", "POST", {
      kind: "WORKFORCE",
      identifier: operator.email,
      password: operator.password,
    });
    const suffix = randomUUID().slice(0, 8);
    const store = await mutate(admin, "/admin/stores", "POST", {
      name: `TryOn Atelier ${suffix}`,
      description: "Disposable private-preview acceptance store",
    });
    storeId = store.id;
    const member = await mutate(admin, `/stores/${storeId}/members`, "POST", {
      name: "Super admin",
      email: operator.email,
      role: "STORE_ADMIN",
    });
    await mutate(
      admin,
      `/me/invitations/${member.membership.id}/accept`,
      "POST",
    );
    await mutate(admin, `/stores/${storeId}`, "PATCH", { status: "ACTIVE" });
    const category = await mutate(admin, "/admin/categories", "POST", {
      name: `Preview Sarees ${suffix}`,
      parentId: null,
    });
    const product = await mutate(admin, `/stores/${storeId}/products`, "POST", {
      title: `Rose Saree ${suffix}`,
      sku: `PREVIEW-${suffix}`,
      categoryId: category.id,
      price: "2800.00",
      fabric: "Silk",
      colour: "Rose",
    });
    const garment = readFileSync(
      join(process.cwd(), "public/demo/saree-rose.png"),
    );
    const authorization = await mutate(
      admin,
      `/stores/${storeId}/products/${product.id}/uploads`,
      "POST",
      {
        fileName: "owned-garment.png",
        contentType: "image/png",
        bytes: garment.length,
        kind: "IMAGE",
      },
    );
    const raw = await admin.request.put(authorization.uploadUrl, {
      headers: authorization.headers,
      data: garment,
    });
    if (!raw.ok())
      throw Error(`Catalog media fixture failed with ${raw.status()}`);
    await mutate(admin, `/uploads/${authorization.uploadId}/finalize`, "POST");
    await mutate(admin, `/stores/${storeId}/products/${product.id}`, "PATCH", {
      status: "PUBLISHED",
    });
    owner = await signup(page, "Disposable Preview Customer");
    let sourceAuthorizations = 0;
    const photoRequests: Record<string, unknown>[] = [];
    let createIntent: Record<string, unknown> | undefined;
    let rawHadCsrf = false;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/me/try-on/uploads"
      ) {
        sourceAuthorizations += 1;
        photoRequests.push(request.postDataJSON());
      }
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/me/try-on/jobs"
      )
        createIntent = request.postDataJSON();
      if (
        request.method() === "PUT" &&
        request.url().includes("/private-uploads/")
      )
        rawHadCsrf ||= Boolean(request.headers()["x-csrf-token"]);
    });
    await page.goto(`/products/${product.id}`);
    await page.getByRole("link", { name: "Try it on me", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "See yourself in it.",
        exact: true,
      }),
    ).toBeVisible();
    await assertWcagAA(page);
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(page.getByLabel("AI service disclosure")).toHaveCount(0);
    await expect(page.locator("main").getByRole("link", { name: "Privacy", exact: true })).toBeVisible();
    await page.getByLabel("Choose a photo", { exact: true }).setInputFiles({
      name: "corrupt-person.png",
      mimeType: "image/png",
      buffer: Buffer.from("Not an image"),
    });
    expect(sourceAuthorizations).toBe(0);
    await expect(
      page.getByRole("button", { name: "Create my preview", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Create my preview", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      /invalid|does not match/i,
    );
    const before = await (
      await page.request.get("/api/v1/me/try-on/quota")
    ).json();
    expect(before.used).toBe(0);
    await page
      .getByLabel("Choose another photo", { exact: true })
      .setInputFiles(join(process.cwd(), "public/demo/hero-emerald.png"));
    await expect(page.getByAltText("Your selected photo, shown locally before upload", { exact: true })).toBeVisible();
    expect(sourceAuthorizations).toBe(1);
    await page
      .getByRole("button", { name: "Create my preview", exact: true })
      .click();
    await page.waitForURL(/\/account\/previews\/[a-f0-9-]{36}$/);
    const jobId = new URL(page.url()).pathname.split("/").pop()!;
    await expect(
      page.getByRole("heading", { name: "Preview ready", exact: true }),
    ).toBeVisible({ timeout: 60000 });
    await expect(page.locator(".result-image-caption")).toContainText("Sample");
    await expect(page.getByLabel("Preview mode")).toHaveCount(0);
    await expect(page.getByText(/gemini|nano banana|EVALUATION_DEMO|provider processing|AI-generated preview/i)).toHaveCount(0);
    expect(photoRequests).toHaveLength(2);
    for (const request of photoRequests) {
      expect(request.processingRequest).toEqual(config.processingRequest);
      for (const field of ["consent", "adult", "ownPhoto", "providerProcessing"]) expect(request).not.toHaveProperty(field);
    }
    await expect(page.getByText("Not saved", { exact: true })).toBeVisible();
    expect(rawHadCsrf).toBeFalsy();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Preview ready", exact: true }),
    ).toBeVisible();
    const jobs = await (
      await page.request.get("/api/v1/me/try-on/jobs")
    ).json();
    expect(jobs.total).toBe(1);
    expect(createIntent).toBeTruthy();
    const same = await mutate(page, "/me/try-on/jobs", "POST", createIntent);
    expect(same.id).toBe(jobId);
    const allowance = await (
      await page.request.get("/api/v1/me/try-on/quota")
    ).json();
    expect(allowance.used).toBe(1);
    const job = await (
      await page.request.get(`/api/v1/me/try-on/jobs/${jobId}`)
    ).json();
    expect(
      (
        await page.request.get(
          `/api/v1/private-media/${createIntent!.sourceUploadId}/content`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (await admin.request.get(`/api/v1/me/try-on/jobs/${jobId}`)).status(),
    ).toBe(404);
    expect((await anonymous.request.get(job.result.imageUrl)).status()).toBe(
      404,
    );
    outsider = await signup(stranger, "Disposable Other Customer");
    expect(
      (await stranger.request.get(`/api/v1/me/try-on/jobs/${jobId}`)).status(),
    ).toBe(404);
    expect((await stranger.request.get(job.result.imageUrl)).status()).toBe(
      404,
    );
    expect(
      (await (await stranger.request.get("/api/v1/me/try-on/gallery")).json())
        .total,
    ).toBe(0);
    const download = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Download preview", exact: true })
      .click();
    expect((await download).suggestedFilename()).toBe(
      "virtualwardrobe-preview.jpg",
    );
    await assertWcagAA(page);
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    if (stateDirectory)
      await page.screenshot({
        path: join(stateDirectory, "private-preview-mobile.png"),
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "Save to my gallery", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Open saved gallery", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    const savedJob = await (
      await page.request.get(`/api/v1/me/try-on/jobs/${jobId}`)
    ).json();
    const savedMediaId = savedJob.result.id;
    await page
      .getByRole("link", { name: "Open saved gallery", exact: true })
      .click();
    await expect(
      page.getByRole("link", {
        name: `Open preview of ${product.title} · Sample`,
        exact: true,
      }),
    ).toBeVisible();
    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForURL("/");
    await page.goto("/account/gallery");
    await page
      .getByLabel("Mobile number with country code", { exact: true })
      .fill(owner.phone);
    await page.getByLabel("Password", { exact: true }).fill(owner.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("/account/gallery");
    await expect(
      page.getByRole("heading", {
        name: "A gallery that stays yours.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: `Open preview of ${product.title} · Sample`,
        exact: true,
      }),
    ).toBeVisible();
    await mutate(admin, `/stores/${storeId}/products/${product.id}`, "PATCH", {
      status: "ARCHIVED",
    });
    await page.reload();
    await expect(
      page.getByText(
        "The product is archived. Your saved preview remains available.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      (
        await page.request.get(`/api/v1/private-media/${savedMediaId}/content`)
      ).ok(),
    ).toBeTruthy();
    await assertWcagAA(page);
    if (stateDirectory)
      await page.screenshot({
        path: join(stateDirectory, "private-gallery-mobile.png"),
        fullPage: true,
      });
    await page
      .getByRole("button", {
        name: `Delete saved preview of ${product.title}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Confirm gallery deletion", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Keep a little inspiration.",
        exact: true,
      }),
    ).toBeVisible();
    const deletedJob = await (
      await page.request.get(`/api/v1/me/try-on/jobs/${jobId}`)
    ).json();
    expect(deletedJob.result).toBeNull();
    expect(deletedJob.discarded).toBeTruthy();
    expect(
      (
        await page.request.get(`/api/v1/private-media/${savedMediaId}/content`)
      ).status(),
    ).toBe(404);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  } finally {
    if (owner)
      await mutate(page, "/me", "DELETE", {
        password: owner.password,
        confirm: true,
      });
    if (outsider)
      await mutate(stranger, "/me", "DELETE", {
        password: outsider.password,
        confirm: true,
      });
    if (storeId)
      await mutate(admin, `/stores/${storeId}`, "PATCH", {
        status: "ARCHIVED",
      });
    await Promise.all([
      workforceContext.close(),
      ownerContext.close(),
      strangerContext.close(),
      anonymousContext.close(),
    ]);
  }
});

test("UI only: queued cancellation, unknown outcomes and full-gallery errors stay truthful", async ({
  page,
}) => {
  const jobId = "11111111-1111-4111-8111-111111111111",
    productId = "22222222-2222-4222-8222-222222222222",
    mediaId = "33333333-3333-4333-8333-333333333333";
  const user = {
    id: "44444444-4444-4444-8444-444444444444",
    name: "UI Fixture Customer",
    kind: "CUSTOMER",
    phone: "+919300000000",
    phoneVerified: false,
    enabled: true,
    superAdmin: false,
    passwordChangeRequired: false,
    memberships: [],
  };
  await page.route("**/api/v1/auth/session", (route) =>
    route.fulfill({ json: { user } }),
  );
  const basic = {
    id: jobId,
    productId,
    product: {
      id: productId,
      title: "UI Fixture Saree",
      sku: "UI-FIXTURE",
      storeId: "55555555-5555-4555-8555-555555555555",
      storeName: "UI Fixture Store",
      price: "2500.00",
      currency: "INR",
    },
    state: "QUEUED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + 180000).toISOString(),
    attempts: 0,
    provider: "mock",
    model: "fixture-v1",
    demo: true,
    evaluationDemo: false,
    label: "Demo preview",
    notice: "This is an explicit UI fixture.",
    discarded: false,
    error: null as { code: string; message: string; canRetry: boolean } | null,
    result: null as {
      id: string;
      imageUrl: string;
      downloadUrl: string;
      expiresAt: string | null;
      saved: boolean;
      saving: boolean;
    } | null,
    canCancel: true,
    canSave: false,
    canDiscard: true,
  };
  let job = { ...basic };
  await page.route("**/api/v1/me/try-on/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith(`/${jobId}/cancel`)) {
      job = { ...job, state: "CANCELLED", canCancel: false };
      await route.fulfill({ json: job });
      return;
    }
    if (path.endsWith(`/${jobId}/save`)) {
      await route.fulfill({
        status: 409,
        json: {
          code: "GALLERY_FULL",
          detail:
            "Your saved gallery is full. Delete a preview before saving another.",
        },
      });
      return;
    }
    if (path.endsWith(`/${jobId}`)) {
      await route.fulfill({ json: job });
      return;
    }
    await route.continue();
  });
  await page.route(`**/api/v1/private-media/${mediaId}/content`, (route) =>
    route.fulfill({
      contentType: "image/png",
      body: readFileSync(join(process.cwd(), "public/demo/saree-rose.png")),
    }),
  );
  await page.goto(`/account/previews/${jobId}`);
  await page
    .getByRole("button", { name: "Cancel this request", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Request cancelled", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Try again with a new photo", exact: true }),
  ).toHaveAttribute("href", `/try-on?product=${productId}`);
  job = {
    ...basic,
    state: "FAILED",
    canCancel: false,
    error: {
      code: "UNKNOWN_OUTCOME",
      message: "The provider outcome is unknown.",
      canRetry: true,
    },
  };
  await page.reload();
  await expect(page.getByText("You can try again with a new photo.", { exact: true })).toBeVisible();
  await expect(page.getByText(/provider|model|unknown outcome/i)).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Try again with a new photo", exact: true }),
  ).toBeVisible();
  job = {
    ...basic,
    state: "SUCCEEDED",
    canCancel: false,
    canSave: true,
    result: {
      id: mediaId,
      imageUrl: `/api/v1/private-media/${mediaId}/content`,
      downloadUrl: `/api/v1/private-media/${mediaId}/download`,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      saved: false,
      saving: false,
    },
  };
  await page.reload();
  await page
    .getByRole("button", { name: "Save to my gallery", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Your saved gallery is full.",
  );
  await expect(
    page.getByRole("link", { name: "Open saved gallery", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save to my gallery", exact: true }),
  ).toBeEnabled();
  job = { ...basic };
  await page.route(/\/api\/v1\/me\/try-on\/jobs\?/, (route) =>
    route.fulfill({ json: { items: [job], total: 1, page: 0, size: 12 } }),
  );
  await page.route("**/api/v1/me/try-on/quota", (route) =>
    route.fulfill({
      json: {
        used: 1,
        remaining: 4,
        limit: 5,
        resetsAt: new Date(Date.now() + 86400000).toISOString(),
        saved: 0,
        savedLimit: 100,
      },
    }),
  );
  await page.goto("/account/previews");
  await expect(page.locator(".wardrobe-job-placeholder strong")).toHaveText(
    "Queued",
  );
  await assertWcagAA(page);
});

test("UI only: photo selection stays local and each create uses the current action protocol", async ({ page }) => {
  const productId = "22222222-2222-4222-8222-222222222222";
  const user = {
    id: "44444444-4444-4444-8444-444444444444", name: "UI Fixture Customer", kind: "CUSTOMER",
    phone: "+919300000000", phoneVerified: false, enabled: true, superAdmin: false,
    passwordChangeRequired: false, memberships: [],
  };
  await page.route("**/api/v1/auth/session", (route) => route.fulfill({ json: { user } }));
  let version = "ui-action-v2-1", remaining = 5, configReads = 0, forbiddenRequests = 0;
  const authorizations: Record<string, unknown>[] = [];
  await page.route("**/api/v1/try-on/config", (route) => {
    configReads += 1;
    return route.fulfill({ json: {
      enabled: true, disabledReason: null, mode: "FIXTURE", provider: "mock", model: "fixture-v1", location: "local",
      label: "Demo preview", notice: "EVALUATION_DEMO provider processing is hidden from the customer flow.",
      processingRequest: { version, action: "TRY_ON" },
      consent: { version: "legacy-ui-v1", notice: "Legacy adult and provider attestation", providerPolicyUrl: null,
        sourceRetentionHours: 24, unsavedRetentionHours: 24, savedLimit: 100, privateUrlSeconds: 300, adultSelfOnly: true },
      limits: { customerDaily: 5, globalDaily: 100, dailyBudgetUsd: "5.00" },
    } });
  });
  await page.route("**/api/v1/me/try-on/quota", (route) => route.fulfill({ json: {
    used: 5 - remaining, remaining, limit: 5, resetsAt: new Date(Date.now() + 86400000).toISOString(), saved: 0, savedLimit: 100,
  } }));
  await page.route(`**/api/v1/products/${productId}`, (route) => route.fulfill({ json: {
    id: productId, storeId: "55555555-5555-4555-8555-555555555555", storeName: "UI Fixture Store", sku: "UI-FIXTURE",
    title: "UI Fixture Saree", description: "Original owned UI fixture.", categoryId: null, categoryPath: [], brandId: null,
    labels: [], price: "2500.00", currency: "INR", fabric: "Silk", colour: "Rose", size: "Free size", status: "PUBLISHED",
    availability: "AVAILABLE", tryOnEnabled: true, coverUrl: "/demo/saree-rose.png", media: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } }));
  await page.route("**/api/v1/me/try-on/uploads", async (route) => {
    authorizations.push(route.request().postDataJSON());
    if (authorizations.length === 1) {
      version = "ui-action-v2-2";
      await route.fulfill({ status: 409, json: { code: "CONSENT_UPDATED", detail: "Action version changed" } });
    } else await route.fulfill({ status: 422, json: { code: "UI_ONLY_BOUNDARY", detail: "No upload was created in this UI-only check." } });
  });
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if ((request.method() === "PUT" && path.includes("private-uploads")) ||
        (request.method() === "POST" && path === "/api/v1/me/try-on/jobs")) forbiddenRequests += 1;
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/try-on?product=${productId}`);
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(page.getByText(/provider|EVALUATION_DEMO|attestation|disclosure/i)).toHaveCount(0);
  await page.getByLabel("Choose a photo", { exact: true }).setInputFiles({ name: "person.webp", mimeType: "image/webp", buffer: Buffer.from("webp-test") });
  await expect(page.getByRole("alert")).toContainText("JPEG or PNG");
  await page.getByLabel("Choose a photo", { exact: true }).setInputFiles(join(process.cwd(), "public/demo/hero-emerald.png"));
  await expect(page.getByRole("button", { name: "Create my preview", exact: true })).toBeEnabled();
  await page.getByLabel("Choose another photo", { exact: true }).setInputFiles(join(process.cwd(), "public/demo/saree-rose.png"));
  expect(authorizations).toHaveLength(0);
  await page.getByRole("button", { name: "Create my preview", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("This step was updated.");
  await expect.poll(() => configReads).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("button", { name: "Create my preview", exact: true })).toBeEnabled();
  expect(authorizations).toHaveLength(1);
  expect(authorizations[0].processingRequest).toEqual({ version: "ui-action-v2-1", action: "TRY_ON" });
  expect(authorizations[0].fileName).toBe("saree-rose.png");
  await page.getByRole("button", { name: "Create my preview", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No upload was created in this UI-only check.");
  expect(authorizations).toHaveLength(2);
  expect(authorizations[1].processingRequest).toEqual({ version: "ui-action-v2-2", action: "TRY_ON" });
  for (const request of authorizations)
    for (const field of ["consent", "adult", "ownPhoto", "providerProcessing"]) expect(request).not.toHaveProperty(field);
  expect(forbiddenRequests).toBe(0);
  remaining = 0;
  page.once("dialog", (dialog) => { void dialog.accept(); });
  await page.reload();
  await page.getByLabel("Choose a photo", { exact: true }).setInputFiles(join(process.cwd(), "public/demo/hero-emerald.png"));
  await expect(page.getByText("You've used today's previews. Your saved and recent previews are still here.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create my preview", exact: true })).toBeDisabled();
  expect(authorizations).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("UI only: a changed action after validation replaces the unused source only on explicit retry", async ({ page }) => {
  const productId = "22222222-2222-4222-8222-222222222222";
  const sources = ["61111111-1111-4111-8111-111111111111", "62222222-2222-4222-8222-222222222222"];
  const user = { id: "44444444-4444-4444-8444-444444444444", kind: "CUSTOMER", name: "UI Fixture Customer",
    phone: "+919300000000", phoneVerified: false, enabled: true, superAdmin: false,
    passwordChangeRequired: false, memberships: [] };
  let version = "ui-create-action-v2-1", configReads = 0;
  const authorizations: Record<string, unknown>[] = [], intents: Record<string, unknown>[] = [], events: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    if (path === "/api/v1/auth/session") return route.fulfill({ json: { user } });
    if (path === "/api/v1/auth/config") return route.fulfill({ json: { signupEnabled: true, passwordMinLength: 12, captcha: { mode: "LOCAL_TEST", action: "signup" } } });
    if (path === "/api/v1/auth/csrf") return route.fulfill({ json: { token: "controlled-ui-token", headerName: "X-CSRF-TOKEN" } });
    if (path === "/api/v1/try-on/config") {
      configReads += 1;
      return route.fulfill({ json: { enabled: true, processingRequest: { version, action: "TRY_ON" }, mode: "FIXTURE" } });
    }
    if (path === "/api/v1/me/try-on/quota") return route.fulfill({ json: { used: 0, remaining: 5, limit: 5, saved: 0, savedLimit: 100, resetsAt: new Date(Date.now() + 86400000).toISOString() } });
    if (path === `/api/v1/products/${productId}`) return route.fulfill({ json: { id: productId, title: "UI Fixture Saree", storeName: "UI Fixture Store", price: "2500.00", status: "PUBLISHED", availability: "AVAILABLE", tryOnEnabled: true, coverUrl: "/demo/saree-rose.png" } });
    if (path === "/api/v1/me/try-on/uploads" && method === "POST") {
      authorizations.push(request.postDataJSON());const index = authorizations.length - 1;
      events.push(`authorize:${index + 1}`);
      return route.fulfill({ json: { uploadId: sources[index], uploadUrl: `/api/v1/private-uploads/${sources[index]}/content`, method: "PUT", headers: { "Content-Type": "image/png", "X-Upload-Token": "controlled-capability" } } });
    }
    const sourceIndex = sources.findIndex((id) => path.includes(id));
    if (sourceIndex >= 0 && method === "PUT") {
      expect(request.headers()).not.toHaveProperty("x-csrf-token");events.push(`put:${sourceIndex + 1}`);
      return route.fulfill({ status: 204 });
    }
    if (sourceIndex >= 0 && path.endsWith("/finalize") && method === "POST") {
      events.push(`finalize:${sourceIndex + 1}`);
      return route.fulfill({ json: { source: { id: sources[sourceIndex], state: "VALIDATED", expiresAt: new Date(Date.now() + 86400000).toISOString() } } });
    }
    if (sourceIndex >= 0 && method === "DELETE") { events.push(`delete:${sourceIndex + 1}`);return route.fulfill({ status: 204 }); }
    if (path === "/api/v1/me/try-on/jobs" && method === "POST") {
      intents.push(request.postDataJSON());events.push(`job:${intents.length}`);
      if (intents.length === 1) { version = "ui-create-action-v2-2";return route.fulfill({ status: 409, json: { code: "CONSENT_UPDATED", detail: "Action changed after photo validation" } }); }
      return route.fulfill({ status: 422, json: { code: "UI_ONLY_BOUNDARY", detail: "No generation was created in this UI-only check." } });
    }
    return route.fulfill({ status: 404, json: { code: "UI_ONLY_UNAVAILABLE" } });
  });
  await page.goto(`/try-on?product=${productId}`);
  await page.getByLabel("Choose a photo", { exact: true }).setInputFiles(join(process.cwd(), "public/demo/hero-emerald.png"));
  expect(events).toEqual([]);
  await page.getByRole("button", { name: "Create my preview", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("This step was updated.");
  await expect.poll(() => configReads).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("button", { name: "Create my preview", exact: true })).toBeEnabled();
  expect(events).toEqual(["authorize:1", "put:1", "finalize:1", "job:1"]);
  expect(intents).toHaveLength(1);
  await page.getByRole("button", { name: "Create my preview", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No generation was created in this UI-only check.");
  expect(events).toEqual(["authorize:1", "put:1", "finalize:1", "job:1", "delete:1", "authorize:2", "put:2", "finalize:2", "job:2"]);
  expect(authorizations.map((body) => body.processingRequest)).toEqual([
    { version: "ui-create-action-v2-1", action: "TRY_ON" }, { version: "ui-create-action-v2-2", action: "TRY_ON" },
  ]);
  expect(intents.map((body) => body.sourceUploadId)).toEqual(sources);
  expect(intents[1].idempotencyKey).not.toBe(intents[0].idempotencyKey);
  for (const body of authorizations)
    for (const field of ["consent", "adult", "ownPhoto", "providerProcessing"]) expect(body).not.toHaveProperty(field);
});
