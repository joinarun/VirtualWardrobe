import { test, expect } from "@playwright/test";
import { assertWcagAA } from "./contrast";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const baseURL = process.env.BASE_URL || "http://localhost:5173";
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

test("real private photo consent, idempotent job, download, gallery persistence and owner isolation", async ({
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
    let createIntent: Record<string, unknown> | undefined;
    let rawHadCsrf = false;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/me/try-on/uploads"
      )
        sourceAuthorizations += 1;
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
        name: "Picture this piece, your way.",
        exact: true,
      }),
    ).toBeVisible();
    await assertWcagAA(page);
    await expect(page.getByLabel("AI service disclosure")).toContainText(
      config.label,
    );
    await page.getByLabel("Choose a photo", { exact: true }).setInputFiles({
      name: "corrupt-person.png",
      mimeType: "image/png",
      buffer: Buffer.from("Not an image"),
    });
    expect(sourceAuthorizations).toBe(0);
    await expect(
      page.getByRole("button", { name: "Create a demo preview", exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel("I am an adult (18 or older).", { exact: true })
      .check();
    await page
      .getByLabel("This is my own photo, and it shows only me.", {
        exact: true,
      })
      .check();
    await page.getByLabel(/^I consent to the processing and retention/).check();
    await page
      .getByRole("button", { name: "Create a demo preview", exact: true })
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
    await expect(page.locator(".selected-photo-name")).toContainText(
      "hero-emerald.png",
    );
    await page
      .getByLabel("This is my own photo, and it shows only me.", {
        exact: true,
      })
      .check();
    await page.getByLabel(/^I consent to the processing and retention/).check();
    await page
      .getByRole("button", { name: "Create a demo preview", exact: true })
      .click();
    await page.waitForURL(/\/account\/previews\/[a-f0-9-]{36}$/);
    const jobId = new URL(page.url()).pathname.split("/").pop()!;
    await expect(
      page.getByRole("heading", { name: "Preview ready", exact: true }),
    ).toBeVisible({ timeout: 60000 });
    await expect(page.getByLabel("Preview mode")).toContainText(config.label);
    await expect(
      page.getByText(
        "This is a local demonstration fixture, not an actual generated try-on.",
        { exact: true },
      ),
    ).toBeVisible();
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
        name: `Open preview of ${product.title} · Demo preview`,
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
        name: `Open preview of ${product.title} · Demo preview`,
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
  await expect(page.locator(".preview-actions")).toContainText(
    "was not automatically retried",
  );
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
    "QUEUED",
  );
  await assertWcagAA(page);
});

test("UI only: personal-photo consent is renewed for each photo and disclosure version", async ({
  page,
}) => {
  const productId = "22222222-2222-4222-8222-222222222222";
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
  let version = "ui-consent-1",
    remaining = 5,
    uploads = 0;
  await page.route("**/api/v1/try-on/config", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        disabledReason: null,
        mode: "FIXTURE",
        provider: "mock",
        model: "fixture-v1",
        location: "local",
        label: "Demo preview",
        notice: "Explicit UI test fixture; no generation is performed.",
        consent: {
          version,
          notice: "Read this UI test fixture disclosure before confirming.",
          providerPolicyUrl: null,
          sourceRetentionHours: 24,
          unsavedRetentionHours: 24,
          savedLimit: 100,
          privateUrlSeconds: 300,
          adultSelfOnly: true,
        },
        limits: { customerDaily: 5, globalDaily: 100, dailyBudgetUsd: "5.00" },
      },
    }),
  );
  await page.route("**/api/v1/me/try-on/quota", (route) =>
    route.fulfill({
      json: {
        used: 5 - remaining,
        remaining,
        limit: 5,
        resetsAt: new Date(Date.now() + 86400000).toISOString(),
        saved: 0,
        savedLimit: 100,
      },
    }),
  );
  await page.route(`**/api/v1/products/${productId}`, (route) =>
    route.fulfill({
      json: {
        id: productId,
        storeId: "55555555-5555-4555-8555-555555555555",
        storeName: "UI Fixture Store",
        sku: "UI-FIXTURE",
        title: "UI Fixture Saree",
        description: "Original owned demo asset for a UI-only test.",
        categoryId: null,
        categoryPath: [],
        brandId: null,
        labels: [],
        price: "2500.00",
        currency: "INR",
        fabric: "Silk",
        colour: "Rose",
        size: "Free size",
        status: "PUBLISHED",
        availability: "AVAILABLE",
        tryOnEnabled: true,
        coverUrl: "/demo/saree-rose.png",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        media: [],
      },
    }),
  );
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/me/try-on/uploads")
    )
      uploads += 1;
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`/try-on?product=${productId}`);
  await page.getByLabel("Choose a photo", { exact: true }).setInputFiles({
    name: "person.webp",
    mimeType: "image/webp",
    buffer: Buffer.from("webp-test"),
  });
  await expect(page.getByRole("alert")).toContainText("JPEG or PNG");
  await page
    .getByLabel("Choose a photo", { exact: true })
    .setInputFiles(join(process.cwd(), "public/demo/hero-emerald.png"));
  await page
    .getByLabel("I am an adult (18 or older).", { exact: true })
    .check();
  await page
    .getByLabel("This is my own photo, and it shows only me.", { exact: true })
    .check();
  await page.getByLabel(/^I consent to the processing and retention/).check();
  await expect(
    page.getByRole("button", { name: "Create a demo preview", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Choose another photo", { exact: true })
    .setInputFiles(join(process.cwd(), "public/demo/saree-rose.png"));
  await expect(
    page.getByLabel("This is my own photo, and it shows only me.", {
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel(/^I consent to the processing and retention/),
  ).not.toBeChecked();
  await page
    .getByLabel("This is my own photo, and it shows only me.", { exact: true })
    .check();
  await page.getByLabel(/^I consent to the processing and retention/).check();
  version = "ui-consent-2";
  await page
    .getByRole("button", {
      name: "Refresh service details and allowance",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel(/^I consent to the processing and retention/),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Create a demo preview", exact: true }),
  ).toBeDisabled();
  await page.getByLabel(/^I consent to the processing and retention/).check();
  remaining = 0;
  await page
    .getByRole("button", {
      name: "Refresh service details and allowance",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(
      "Your daily allowance is used. You can still view, download and manage existing previews.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create a demo preview", exact: true }),
  ).toBeDisabled();
  expect(uploads).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
