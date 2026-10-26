import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

async function mutate(
  page: Page,
  path: string,
  method: string,
  data: unknown = {},
) {
  const security = await (await page.request.get("/api/v1/auth/csrf")).json();
  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    data,
    headers: { [security.headerName]: security.token },
  });
  if (!response.ok())
    throw Error(
      `Fixture setup ${method} ${path} failed with ${response.status()}`,
    );
  return response.status() === 204 ? null : response.json();
}
async function openWorkspace(page: Page) {
  const stateDirectory = process.env.TEST_STATE_DIRECTORY;
  const fixture =
    stateDirectory && join(stateDirectory, "admin-credential.json");
  test.skip(
    !fixture || !existsSync(fixture),
    "An owner-only operator fixture from the identity acceptance journey is required.",
  );
  if (!fixture) throw Error("Operator fixture unavailable");
  const operator = JSON.parse(readFileSync(fixture, "utf8"));
  await page.goto("/staff/login");
  await page.getByLabel("Email address").fill(operator.email);
  await page.getByLabel("Password", { exact: true }).fill(operator.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("/staff");
  return operator;
}
const disposableStores = new Set<string>();
test.afterEach(async ({ page }) => {
  for (const id of disposableStores)
    await mutate(page, `/stores/${id}`, "PATCH", { status: "ARCHIVED" });
  disposableStores.clear();
});

const sourceImage = join(process.cwd(), "public/demo/saree-emerald.png");
const secondImage = join(process.cwd(), "public/demo/saree-rose.png");
const video = join(process.cwd(), "e2e/fixtures/product-demo.mp4");

test("real catalog publishing, media validation, logos, gallery, discovery, pagination and archive", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  const operator = await openWorkspace(page);
  const suffix = randomUUID().slice(0, 8);
  const storeName = `Catalog Atelier ${suffix}`;
  const title = `Emerald Silk ${suffix}`;
  const categoryName = `Sarees ${suffix}`;
  const parentName = `Clothing ${suffix}`;
  const brandName = `Studio ${suffix}`;
  const store = await mutate(page, "/admin/stores", "POST", {
    name: storeName,
    description: "Disposable catalog browser acceptance store",
  });
  disposableStores.add(store.id);
  const provision = await mutate(page, `/stores/${store.id}/members`, "POST", {
    name: "Super admin",
    email: operator.email,
    role: "STORE_ADMIN",
  });
  await mutate(
    page,
    `/me/invitations/${provision.membership.id}/accept`,
    "POST",
  );
  await mutate(page, `/stores/${store.id}`, "PATCH", { status: "ACTIVE" });
  await page.reload();
  await page
    .getByRole("button", { name: "Platform catalog", exact: true })
    .click();
  await page.getByLabel("Category name", { exact: true }).fill(parentName);
  await page
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  await expect(
    page.getByText("Category created.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Category name", { exact: true }).fill(categoryName);
  await page.getByLabel("Parent category").selectOption({ label: parentName });
  await page
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  await expect(page.getByLabel("Category name", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByRole("button", { name: "Global brands", exact: true })
    .click();
  await page.getByLabel("Brand name", { exact: true }).fill(`Global ${suffix}`);
  await page.getByRole("button", { name: "Create brand", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `Global ${suffix}`, exact: true }),
  ).toBeVisible();
  await page
    .getByLabel(`Upload logo for Global ${suffix}`, { exact: true })
    .setInputFiles(sourceImage);
  await expect(
    page.getByText("Brand logo uploaded and validated.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Current store").selectOption(store.id);
  await page
    .getByRole("button", { name: "Store profile", exact: true })
    .click();
  await page
    .getByLabel("Upload store logo", { exact: true })
    .setInputFiles(sourceImage);
  await expect(page.locator(".logo-preview img")).toHaveAttribute(
    "src",
    /\/thumbnail$/,
  );
  await page.getByRole("button", { name: "Store brands", exact: true }).click();
  await page.getByLabel("Brand name", { exact: true }).fill(brandName);
  await page.getByRole("button", { name: "Create brand", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: brandName, exact: true }),
  ).toBeVisible();
  await page
    .getByLabel(`Upload logo for ${brandName}`, { exact: true })
    .setInputFiles(sourceImage);
  await expect(
    page.getByText("Brand logo uploaded and validated.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Products", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Add product", exact: true })
    .click();
  await page.getByLabel("Product title").fill(title);
  await page.getByLabel("SKU / reference").fill(`UI-${suffix}`);
  await page
    .getByLabel("Description", { exact: true })
    .fill(
      "A soft silk saree with an intricately woven gold border. Original demo photography.",
    );
  await page
    .getByLabel("Category", { exact: true })
    .selectOption({ label: `${parentName} / ${categoryName}` });
  await page.locator("#product-brand").selectOption({ label: brandName });
  await page.getByLabel("Price in INR ₹").fill("2499.00");
  await page.getByLabel("Fabric", { exact: true }).fill("Soft silk");
  await page.getByLabel("Colour", { exact: true }).fill("Emerald");
  await page
    .getByLabel("Labels", { exact: true })
    .fill(`woven design, ui-${suffix}`);
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(
    page.getByText("Product details saved.", { exact: true }),
  ).toBeVisible();
  const listing = await (
    await page.request.get(`/api/v1/stores/${store.id}/products`)
  ).json();
  const product = listing.items.find(
    (item: { title: string }) => item.title === title,
  );
  expect(product.status).toBe("DRAFT");
  const visitor = await browser.newContext({
    baseURL: process.env.BASE_URL || "http://localhost:5173",
  });
  const customer = await visitor.newPage();
  await customer.goto(`/?q=${suffix}`);
  await expect(
    customer.getByRole("link", { name: `View ${title}`, exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("I have permission to publish these product files.")
    .check();
  await page.getByLabel("Add photos or a video", { exact: true }).setInputFiles(
    Array.from({ length: 11 }, (_, index) => ({
      name: `limit-${index}.png`,
      mimeType: "image/png",
      buffer: Buffer.from("bounds-test"),
    })),
  );
  await expect(page.getByRole("alert")).toContainText("up to 10 images");
  await page
    .getByLabel("Add photos or a video", { exact: true })
    .setInputFiles({
      name: "invalid.png",
      mimeType: "image/png",
      buffer: Buffer.from("This is not a PNG"),
    });
  await expect(page.locator(".upload-status-list .danger-text")).toContainText(
    /invalid|does not match/i,
  );
  await page
    .getByLabel("Add photos or a video", { exact: true })
    .setInputFiles([sourceImage, secondImage, video]);
  await expect(page.locator(".media-management-list > li")).toHaveCount(3, {
    timeout: 60000,
  });
  await expect(page.locator(".upload-status-list")).not.toContainText(
    "Waiting to upload",
  );
  await page
    .getByRole("button", { name: "Use as cover photo 2", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use as cover photo 2", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Use for try-on photo 2", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use for try-on photo 2", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Move media 2 up", exact: true })
    .click();
  await expect(
    page.locator(".media-management-list > li").first(),
  ).toContainText("Cover");
  await page
    .getByLabel("Publication", { exact: true })
    .selectOption("PUBLISHED");
  await page
    .getByRole("button", { name: "Save product details", exact: true })
    .click();
  await expect(
    page.getByText(
      "Product published. Customers can find it when this store is active.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Archive ${title}`, exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  if (process.env.TEST_STATE_DIRECTORY)
    await page.locator(".product-editor").screenshot({
      path: join(
        process.env.TEST_STATE_DIRECTORY,
        "staff-product-editor-mobile.png",
      ),
    });
  await page.setViewportSize({ width: 1280, height: 900 });

  await customer.reload();
  await expect(
    customer.getByRole("link", { name: `View ${title}`, exact: true }),
  ).toBeVisible();
  await customer.getByLabel("Store", { exact: true }).selectOption(store.id);
  await customer
    .getByLabel("Category", { exact: true })
    .selectOption({ label: parentName });
  await customer
    .getByLabel("Brand", { exact: true })
    .selectOption({ label: brandName });
  await customer.getByLabel("Min price ₹", { exact: true }).fill("2000");
  await customer.getByLabel("Max price ₹", { exact: true }).fill("3000");
  await customer
    .getByLabel("Label or detail", { exact: true })
    .fill(`ui-${suffix}`);
  await customer
    .getByLabel("Sort by", { exact: true })
    .selectOption("price_asc");
  await expect(
    customer.getByRole("link", { name: `View ${title}`, exact: true }),
  ).toBeVisible();
  const thumbnail = customer.getByRole("img", { name: title, exact: true });
  const thumbnailUrl = await thumbnail.getAttribute("src");
  expect(thumbnailUrl).toMatch(/\/thumbnail$/);
  const derivative = await customer.request.get(thumbnailUrl!);
  expect(derivative.headers()["content-type"]).toContain("image/jpeg");
  expect((await derivative.body()).length).toBeLessThan(
    readFileSync(secondImage).length / 2,
  );
  await customer
    .getByRole("link", { name: `View ${title}`, exact: true })
    .click();
  await expect(
    customer.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    customer.getByRole("button", { name: "Try it on me", exact: true }),
  ).toBeDisabled();
  await customer
    .getByRole("button", { name: "View product image 2", exact: true })
    .click();
  await expect(customer.locator(".detail-main-image img")).toHaveAttribute(
    "src",
    /\/content$/,
  );
  await customer
    .getByRole("button", { name: "View product video", exact: true })
    .click();
  await expect(
    customer.getByLabel(`Video of ${title}`, { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      customer
        .locator(".detail-main-image video")
        .evaluate((element) => (element as HTMLVideoElement).readyState),
    )
    .toBeGreaterThan(0);

  await customer.setViewportSize({ width: 360, height: 800 });
  await customer
    .getByRole("button", { name: "View product image 1", exact: true })
    .click();
  if (process.env.TEST_STATE_DIRECTORY)
    await customer.screenshot({
      path: join(process.env.TEST_STATE_DIRECTORY, "product-detail-mobile.png"),
      fullPage: true,
    });

  expect(
    await customer.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByLabel("Add photos or a video", { exact: true })
    .setInputFiles(video);
  await expect(page.getByRole("alert")).toContainText("one video");
  await page
    .getByRole("button", { name: "Remove media 3", exact: true })
    .click();
  await expect(page.locator(".media-management-list > li")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Remove media 2", exact: true })
    .click();
  await expect(page.locator(".media-management-list > li")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Remove media 1", exact: true }),
  ).toBeDisabled();
  // Populate distinct disposable records through the real upload boundary to exercise a second catalog page.
  const published = await (
    await page.request.get(`/api/v1/products/${product.id}`)
  ).json();
  const fixtureBytes = await derivative.body();
  for (let index = 1; index <= 12; index += 1) {
    const extra = await mutate(page, `/stores/${store.id}/products`, "POST", {
      sku: `PAGE-${suffix}-${index}`,
      title: `${title} Variant ${index}`,
      categoryId: published.categoryId,
      brandId: published.brandId,
      price: String(3000 + index),
      labels: [`ui-${suffix}`],
    });
    const authorization = await mutate(
      page,
      `/stores/${store.id}/products/${extra.id}/uploads`,
      "POST",
      {
        fileName: "owned-thumbnail.jpg",
        contentType: "image/jpeg",
        bytes: fixtureBytes.length,
        kind: "IMAGE",
      },
    );
    const raw = await page.request.put(authorization.uploadUrl, {
      headers: authorization.headers,
      data: fixtureBytes,
    });
    if (!raw.ok())
      throw Error(`Disposable media PUT failed with ${raw.status()}`);
    await mutate(page, `/uploads/${authorization.uploadId}/finalize`, "POST");
    await mutate(page, `/stores/${store.id}/products/${extra.id}`, "PATCH", {
      status: "PUBLISHED",
    });
  }
  await customer.goto(`/?storeId=${store.id}&sort=price_asc`);
  await expect(customer.locator(".product-card")).toHaveCount(12);
  if (
    (await customer.locator(".catalog-filters").getAttribute("open")) !== null
  )
    await customer.locator(".catalog-filters > summary").click();
  await expect(customer.locator(".catalog-filters")).not.toHaveAttribute(
    "open",
    "",
  );
  await customer
    .locator("#collection")
    .evaluate((element) =>
      element.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  await expect
    .poll(() =>
      customer
        .locator(".product-card img")
        .evaluateAll((images) =>
          images
            .filter(
              (image) =>
                image.getBoundingClientRect().top < window.innerHeight &&
                image.getBoundingClientRect().bottom > 0,
            )
            .every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
        ),
    )
    .toBeTruthy();
  if (process.env.TEST_STATE_DIRECTORY)
    await customer.screenshot({
      path: join(process.env.TEST_STATE_DIRECTORY, "catalog-mobile.png"),
    });
  await customer.setViewportSize({ width: 1280, height: 900 });
  await customer.locator(".catalog-filters > summary").click();
  await customer
    .locator("#collection")
    .evaluate((element) =>
      element.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  await expect
    .poll(() =>
      customer
        .locator(".product-card img")
        .evaluateAll((images) =>
          images
            .filter(
              (image) =>
                image.getBoundingClientRect().top < window.innerHeight &&
                image.getBoundingClientRect().bottom > 0,
            )
            .every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
        ),
    )
    .toBeTruthy();
  if (process.env.TEST_STATE_DIRECTORY)
    await customer.screenshot({
      path: join(process.env.TEST_STATE_DIRECTORY, "catalog-desktop.png"),
    });
  await customer.setViewportSize({ width: 360, height: 800 });
  await expect(
    customer.getByText("Page 1 of 2", { exact: true }),
  ).toBeVisible();
  await expect(customer.locator(".product-card h3").first()).toHaveText(title);
  await customer.getByRole("button", { name: "Next", exact: true }).click();
  await expect(customer.locator(".product-card")).toHaveCount(1);
  await expect(
    customer.getByText("Page 2 of 2", { exact: true }),
  ).toBeVisible();
  await customer.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(customer.locator(".product-card")).toHaveCount(12);
  await customer
    .getByLabel("Sort by", { exact: true })
    .selectOption("price_desc");
  await expect(customer.locator(".product-card h3").first()).toHaveText(
    `${title} Variant 12`,
  );
  await customer
    .getByLabel("Search the collection", { exact: true })
    .fill(`No matching piece ${suffix}`);
  await customer.getByRole("button", { name: "Search", exact: true }).click();
  await expect(customer.locator(".product-card")).toHaveCount(0);
  await customer.goBack();
  await expect(
    customer.getByLabel("Search the collection", { exact: true }),
  ).toHaveValue("");
  await expect(customer.locator(".product-card")).toHaveCount(12);
  expect(
    await customer.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await customer.goto(`/products/${product.id}`);
  await page
    .getByLabel("Availability", { exact: true })
    .selectOption("UNAVAILABLE");
  await page
    .getByRole("button", { name: "Save product details", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save product details", exact: true }),
  ).toBeEnabled();
  await customer.reload();
  await expect(
    customer.getByText(
      "This piece is currently unavailable. Try-on and callback actions are unavailable.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page
    .getByRole("button", { name: `Archive ${title}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Archive product", exact: true })
    .click();
  await expect(
    page.getByText(
      "Product archived. Existing references and history are preserved.",
      { exact: true },
    ),
  ).toBeVisible();
  await customer.goto(`/?q=${suffix}`);
  await expect(
    customer.getByRole("link", { name: `View ${title}`, exact: true }),
  ).toHaveCount(0);
  const unavailable = await customer.request.get(
    `/api/v1/products/${product.id}`,
  );
  expect(unavailable.status()).toBe(404);
  await mutate(page, `/stores/${store.id}`, "PATCH", { status: "ARCHIVED" });
  await visitor.close();
});

test("UI only: catalog failure is explicit and retry loads the real service", async ({
  page,
}) => {
  await page.route("**/api/v1/products?*", (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: "TEMPORARILY_UNAVAILABLE",
        detail: "The collection is temporarily unavailable.",
      },
    }),
  );
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await expect(page.locator(".catalog-filters")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.locator(".catalog-filters > summary").click();
  await expect(page.locator(".catalog-filters")).toHaveAttribute("open", "");
  await expect(page.getByRole("alert")).toContainText(
    "The collection is temporarily unavailable.",
  );
  await expect(page.locator(".product-card")).toHaveCount(0);
  await page.unroute("**/api/v1/products?*");
  const loaded = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/products?") && response.status() === 200,
  );
  await page
    .getByRole("button", { name: "Retry collection", exact: true })
    .click();
  await loaded;
  await expect(
    page.getByText("The collection is temporarily unavailable.", {
      exact: true,
    }),
  ).toHaveCount(0);
});
