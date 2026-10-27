import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { join } from "node:path";
import { demoFixture } from "./demo-fixture";
import type { DemoUser } from "./demo-fixture";
import { assertWcagAA } from "./contrast";
import type { Product } from "../src/catalog-types";
import type { Enquiry } from "../src/enquiry-types";

async function signIn(page: Page, user: DemoUser) {
  await page.goto(user.kind === "CUSTOMER" ? "/account/login" : "/staff/login");
  await page
    .getByLabel(
      user.kind === "CUSTOMER"
        ? "Mobile number with country code"
        : "Email address",
      { exact: true },
    )
    .fill(user.identifier);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.locator(
      user.kind === "CUSTOMER" ? ".customer-account" : ".workspace-main",
    ),
  ).toBeVisible();
}

async function readable<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/v1${path}`);
  if (!response.ok())
    throw Error(`Seeded acceptance read failed (${response.status()}).`);
  return response.json();
}

test("generated demo credentials enable all roles and an actual private-preview to store conversation", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const bundle = demoFixture();
  test.skip(
    !bundle,
    "Explicit partial runs have no protected demo fixture; make e2e requires it.",
  );
  if (!bundle) return;
  const customerUser = bundle.users.find((user) => user.role === "CUSTOMER")!;
  const staffUser = bundle.users.find(
    (user) => user.role === "STAFF" && user.storeIds.length,
  )!;
  const adminUser = bundle.users.find(
    (user) =>
      user.role === "STORE_ADMIN" &&
      user.storeIds.includes(staffUser.storeIds[0]),
  )!;
  const superUser = bundle.users.find((user) => user.role === "SUPER_ADMIN")!;
  expect(
    Boolean(customerUser && staffUser && adminUser && superUser),
  ).toBeTruthy();
  const contexts = await Promise.all(
    Array.from({ length: 4 }, () =>
      browser.newContext({
        baseURL: process.env.BASE_URL || "http://localhost:5173",
      }),
    ),
  );
  const [customer, staff, admin, platform] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const stateDirectory = process.env.TEST_STATE_DIRECTORY;
  let createdJob: string | null = null;
  try {
    const config = await readable<{ mode: string }>(customer, "/try-on/config");
    expect(config.mode).toBe("FIXTURE"); // Never submit the photo journey to a paid provider.
    await signIn(customer, customerUser);
    await expect(
      customer.getByText("Phone unverified", { exact: true }),
    ).toBeVisible();
    await expect(customer.getByLabel("Fictional demo disclosure")).toHaveCount(0);
    await assertWcagAA(customer);
    await customer.goto("/account/gallery");
    await expect(customer.locator(".wardrobe-card").first()).toBeVisible();
    await expect(customer.locator(".wardrobe-image-label").first()).toHaveText(
      "Sample",
    );
    const initialGallery = await readable<{ total: number }>(
      customer,
      "/me/try-on/gallery",
    );
    expect(initialGallery.total).toBeGreaterThanOrEqual(1);
    await assertWcagAA(customer);
    const existing = await readable<{ items: Enquiry[] }>(
      customer,
      "/me/enquiries?size=50",
    );
    const activeProducts = new Set(
      existing.items
        .filter((item) => item.status !== "CLOSED")
        .map((item) => item.product.id),
    );
    const products = await readable<{ items: Product[]; total: number }>(
      customer,
      `/products?storeId=${staffUser.storeIds[0]}&size=50`,
    );
    expect(products.total).toBeGreaterThanOrEqual(10);
    const selected = products.items.find(
      (product) =>
        product.availability === "AVAILABLE" &&
        product.tryOnEnabled &&
        !activeProducts.has(product.id),
    );
    if (!selected)
      throw Error(
        "Seeded acceptance needs an available product without this customer's active enquiry.",
      );
    await customer.goto(`/?storeId=${selected.storeId}`);
    await expect(customer.locator(".product-card").first()).toBeVisible();
    await assertWcagAA(customer);
    await customer.goto(`/products/${selected.id}`);
    await expect(
      customer.getByRole("heading", { name: selected.title, exact: true }),
    ).toBeVisible();
    await expect(customer.locator(".detail-main-image img")).toBeVisible();
    const multimedia = products.items.find((product) =>
      product.media.some((item) => item.kind === "VIDEO"),
    );
    if (!multimedia)
      throw Error("The seeded demo is missing its owned video product.");
    await customer.goto(`/products/${multimedia.id}`);
    await customer
      .getByRole("button", { name: /^View product image/ })
      .nth(1)
      .click();
    await expect(customer.locator(".detail-main-image img")).toBeVisible();
    await customer
      .getByRole("button", { name: "View product video", exact: true })
      .click();
    await expect
      .poll(() =>
        customer
          .locator(".detail-main-image video")
          .evaluate((video) => (video as HTMLVideoElement).readyState),
      )
      .toBeGreaterThanOrEqual(1);
    await assertWcagAA(customer);
    await customer.goto(`/products/${selected.id}`);
    await customer
      .getByRole("link", { name: "Try it on me", exact: true })
      .click();
    await expect(
      customer.getByRole("heading", {
        name: "See yourself in it.",
        exact: true,
      }),
    ).toBeVisible();
    await customer
      .getByLabel("Choose a photo", { exact: true })
      .setInputFiles(join(process.cwd(), "public/demo/hero-emerald.png"));
    await expect(customer.locator('input[type="checkbox"]')).toHaveCount(0);
    await assertWcagAA(customer);
    await customer
      .getByRole("button", { name: "Create my preview", exact: true })
      .click();
    await customer.waitForURL(/\/account\/previews\/[a-f0-9-]{36}$/);
    createdJob = new URL(customer.url()).pathname.split("/").pop()!;
    await expect(
      customer.getByRole("heading", { name: "Preview ready", exact: true }),
    ).toBeVisible({ timeout: 60000 });
    await expect(customer.locator(".result-image-caption")).toContainText("Sample");
    await expect(customer.getByLabel("Preview mode")).toHaveCount(0);
    await customer
      .getByRole("button", { name: "Save to my gallery", exact: true })
      .click();
    await expect(
      customer.getByRole("link", { name: "Open saved gallery", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await assertWcagAA(customer);
    await customer
      .getByRole("link", { name: "Request a store callback", exact: true })
      .click();
    await expect(
      customer.getByRole("heading", {
        name: "Let the store reach out.",
        exact: true,
      }),
    ).toBeVisible();
    await customer
      .getByLabel("Note for the store", { exact: true })
      .fill(
        "Browser acceptance demonstration: please reply in this app. Do not call this fictional number.",
      );
    await customer
      .getByLabel(/^I agree to share my name, unverified mobile number/)
      .check();
    await assertWcagAA(customer);
    await customer
      .getByRole("button", { name: "Request a callback", exact: true })
      .click();
    await customer
      .getByRole("link", { name: "Open my enquiry", exact: true })
      .click();
    const enquiryId = new URL(customer.url()).pathname.split("/").pop()!;
    await expect(customer.locator(".ticket-status")).toHaveText("New");
    await signIn(staff, staffUser);
    await staff.goto(
      `/staff?store=${selected.storeId}&tab=enquiries&enquiry=${enquiryId}`,
    );
    await expect(staff.locator(".ticket-status")).toHaveText("Open");
    await expect(staff.locator(".enquiry-contact dd").first()).toHaveText(
      staffUser.name,
    );
    await staff
      .getByLabel("Customer-visible reply", { exact: true })
      .fill(
        "This fictional demo piece is available. We can continue here without a phone call.",
      );
    await staff
      .getByRole("button", { name: "Send customer reply", exact: true })
      .click();
    await expect(
      staff.getByText("Customer-visible reply sent.", { exact: true }),
    ).toBeVisible();
    await staff
      .getByLabel("Next status", { exact: true })
      .selectOption("AWAITING_CUSTOMER_RESPONSE");
    await staff
      .getByRole("button", { name: "Update status", exact: true })
      .click();
    await expect(staff.locator(".ticket-status")).toHaveText(
      "Awaiting customer response",
    );
    await assertWcagAA(staff);
    await customer.reload();
    await expect(customer.locator(".enquiry-timeline")).toContainText(
      "continue here without a phone call",
    );
    await customer
      .getByLabel("Your reply to the store", { exact: true })
      .fill("Thank you. This demonstration is complete.");
    await customer
      .getByRole("button", { name: "Send reply", exact: true })
      .click();
    await expect(customer.locator(".ticket-status")).toHaveText(
      "Customer replied",
    );
    await customer.setViewportSize({ width: 360, height: 800 });
    await assertWcagAA(customer);
    expect(
      await customer.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await staff
      .getByRole("button", { name: "Refresh enquiry", exact: true })
      .click();
    await expect(staff.locator(".ticket-status")).toHaveText(
      "Customer replied",
    );
    await staff
      .getByLabel("Next status", { exact: true })
      .selectOption("CLOSED");
    await staff
      .getByLabel("Closure outcome", { exact: true })
      .selectOption("CONTACTED");
    await staff
      .getByRole("button", { name: "Update status", exact: true })
      .click();
    await expect(staff.locator(".ticket-status")).toHaveText("Closed");
    await staff.setViewportSize({ width: 360, height: 800 });
    await assertWcagAA(staff);
    expect(
      await staff.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    if (stateDirectory)
      await staff.screenshot({
        path: join(stateDirectory, "seeded-staff-mobile.png"),
        fullPage: true,
      });
    await signIn(admin, adminUser);
    await admin
      .getByLabel("Current store", { exact: true })
      .selectOption(selected.storeId);
    await admin
      .getByRole("button", { name: "Store team", exact: true })
      .click();
    await expect(
      admin.getByRole("heading", { name: "Store team.", exact: true }),
    ).toBeVisible();
    await expect(admin.getByRole("table")).toContainText(staffUser.name);
    await assertWcagAA(admin);
    await signIn(platform, superUser);
    await platform
      .getByRole("button", { name: "Platform workforce", exact: true })
      .click();
    await expect(
      platform.getByRole("heading", {
        name: "Workforce accounts.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(platform.getByRole("table")).toBeVisible();
    await assertWcagAA(platform);
    const visibleStatuses = new Set<string>();
    const demoStores = [
      ...new Set(bundle.users.flatMap((user) => user.storeIds)),
    ];
    expect(demoStores).toHaveLength(3);
    for (const storeId of demoStores) {
      await platform.goto(`/staff?store=${storeId}&tab=enquiries`);
      await expect(platform.locator(".enquiry-table")).toBeVisible();
      for (const status of await platform
        .locator(".enquiry-table .ticket-status")
        .allTextContents())
        visibleStatuses.add(status.trim());
    }
    expect([...visibleStatuses]).toEqual(
      expect.arrayContaining([
        "New",
        "Open",
        "In progress",
        "Awaiting customer response",
        "Customer replied",
        "Closed",
      ]),
    );
    await customer.goto("/account/gallery");
    const job = await readable<{ result: { id: string } }>(
      customer,
      `/me/try-on/jobs/${createdJob}`,
    );
    const card = customer.locator(".wardrobe-card").filter({
      has: customer.locator(`a[href="/account/previews/${createdJob}"]`),
    });
    await card
      .getByRole("button", {
        name: `Delete saved preview of ${selected.title}`,
        exact: true,
      })
      .click();
    await customer
      .getByRole("button", { name: "Confirm gallery deletion", exact: true })
      .click();
    await expect(card).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await readable<{ total: number }>(customer, "/me/try-on/gallery"))
            .total,
      )
      .toBe(initialGallery.total);
    expect(
      (
        await customer.request.get(
          `/api/v1/private-media/${job.result.id}/content`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await staff.request.get(
          `/api/v1/private-media/${job.result.id}/content`,
        )
      ).status(),
    ).toBe(404);
    await customer.goto(`/?storeId=${selected.storeId}`);
    await expect(customer.locator(".product-card").first()).toBeVisible();
    if (stateDirectory)
      await customer.screenshot({
        path: join(stateDirectory, "seeded-storefront-mobile.png"),
        fullPage: true,
      });
  } finally {
    try {
      if (createdJob) {
        const csrf = await readable<{ headerName: string; token: string }>(
          customer,
          "/auth/csrf",
        );
        const removed = await customer.request.delete(
          `/api/v1/me/try-on/jobs/${createdJob}`,
          {
            headers: { [csrf.headerName]: csrf.token },
          },
        );
        expect(
          removed.status(),
          "Only the preview created by this test is discarded during cleanup.",
        ).toBe(204);
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  }
});
