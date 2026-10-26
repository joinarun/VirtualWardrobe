import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { assertTextContrast } from "./contrast";
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
      `Enquiry acceptance ${method} ${path} failed with ${response.status()}`,
    );
  return [202, 204].includes(response.status()) ? null : response.json();
}

test("real customer callback, atomic staff claim, public and private conversation, reassignment, closure and redaction", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const stateDirectory = process.env.TEST_STATE_DIRECTORY,
    fixture = stateDirectory && join(stateDirectory, "admin-credential.json");
  test.skip(
    !fixture || !existsSync(fixture),
    "A verified owner-only operator fixture is required by the standard full runner.",
  );
  if (!fixture) return;
  const operator = JSON.parse(readFileSync(fixture, "utf8"));
  const contexts = await Promise.all(
    Array.from({ length: 6 }, () => browser.newContext({ baseURL })),
  );
  const [admin, customer, staffA, staffB, foreignStaff, stranger] =
    await Promise.all(contexts.map((context) => context.newPage()));
  const suffix = randomUUID().slice(0, 8),
    name = `Callback Customer ${suffix}`,
    phone = `+9194${Date.now().toString().slice(-8)}`,
    password = `Enquiry-${randomUUID()}-aA9`;
  const staffNames = [
    `Callback Staff A ${suffix}`,
    `Callback Staff B ${suffix}`,
    `Other Store Staff ${suffix}`,
  ];
  const staffIds: string[] = [],
    storeIds: string[] = [];
  let customerCreated = false,
    customerDeleted = false,
    strangerAccount: { password: string } | null = null;
  try {
    await mutate(admin, "/auth/login", "POST", {
      kind: "WORKFORCE",
      identifier: operator.email,
      password: operator.password,
    });
    for (const label of ["A", "B"]) {
      const store = await mutate(admin, "/admin/stores", "POST", {
        name: `Callback Atelier ${label} ${suffix}`,
        description: "Disposable enquiry acceptance store",
      });
      storeIds.push(store.id);
      const membership = await mutate(
        admin,
        `/stores/${store.id}/members`,
        "POST",
        { name: "Super admin", email: operator.email, role: "STORE_ADMIN" },
      );
      await mutate(
        admin,
        `/me/invitations/${membership.membership.id}/accept`,
        "POST",
      );
      await mutate(admin, `/stores/${store.id}`, "PATCH", { status: "ACTIVE" });
    }
    const category = await mutate(admin, "/admin/categories", "POST", {
      name: `Callback Sarees ${suffix}`,
      parentId: null,
    });
    const product = await mutate(
      admin,
      `/stores/${storeIds[0]}/products`,
      "POST",
      {
        title: `Callback Saree ${suffix}`,
        sku: `CALLBACK-${suffix}`,
        categoryId: category.id,
        price: "3200.00",
        fabric: "Silk",
        colour: "Emerald",
      },
    );
    const bytes = readFileSync(
      join(process.cwd(), "public/demo/saree-emerald.png"),
    );
    const upload = await mutate(
      admin,
      `/stores/${storeIds[0]}/products/${product.id}/uploads`,
      "POST",
      {
        fileName: "owned-emerald.png",
        contentType: "image/png",
        bytes: bytes.length,
        kind: "IMAGE",
      },
    );
    const raw = await admin.request.put(upload.uploadUrl, {
      headers: upload.headers,
      data: bytes,
    });
    if (!raw.ok())
      throw Error(`Catalog fixture upload failed with ${raw.status()}`);
    await mutate(admin, `/uploads/${upload.uploadId}/finalize`, "POST");
    await mutate(
      admin,
      `/stores/${storeIds[0]}/products/${product.id}`,
      "PATCH",
      { status: "PUBLISHED" },
    );
    for (const [index, page] of [staffA, staffB, foreignStaff].entries()) {
      const provision = await mutate(
        admin,
        `/stores/${storeIds[index === 2 ? 1 : 0]}/members`,
        "POST",
        {
          name: staffNames[index],
          email: `callback-${index}-${suffix}@example.test`,
          role: "STAFF",
        },
      );
      staffIds.push(provision.user.id);
      await mutate(page, "/auth/login", "POST", {
        kind: "WORKFORCE",
        identifier: provision.user.email,
        password: provision.temporaryPassword,
      });
      await mutate(page, "/auth/password", "POST", {
        currentPassword: provision.temporaryPassword,
        newPassword: `Staff-${randomUUID()}-aA9`,
      });
      await mutate(
        page,
        `/me/invitations/${provision.membership.id}/accept`,
        "POST",
      );
    }
    await mutate(customer, "/auth/signup", "POST", {
      name,
      countryCode: "+91",
      mobile: phone.slice(3),
      password,
      privacyAccepted: true,
      captchaToken: "local-development",
    });
    customerCreated = true;
    await customer.goto(`/products/${product.id}`);
    await customer
      .getByRole("link", { name: "Request a callback", exact: true })
      .click();
    await expect(
      customer.getByRole("heading", {
        name: "Let the store reach out.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(customer.getByLabel("Name", { exact: true })).toHaveValue(
      name,
    );
    await expect(
      customer.getByLabel("Mobile number", { exact: true }),
    ).toHaveValue(phone);
    await expect(
      customer.getByRole("button", { name: "Request a callback", exact: true }),
    ).toBeDisabled();
    const note = "Please call after 6 pm. <b>Keep this as plain text.</b>";
    await customer.getByLabel("Note for the store", { exact: true }).fill(note);
    await customer
      .getByLabel(/^I agree to share my name, unverified mobile number/)
      .check();
    await assertTextContrast(customer);
    await customer
      .getByRole("button", { name: "Request a callback", exact: true })
      .click();
    await expect(
      customer.getByText(
        "Your request has been sent. A salesperson from this store will contact you.",
        { exact: true },
      ),
    ).toBeVisible();
    await customer
      .getByRole("link", { name: "Open my enquiry", exact: true })
      .click();
    const enquiryId = new URL(customer.url()).pathname.split("/").pop()!;
    await expect(customer.locator(".ticket-status")).toHaveText("New");
    await expect(customer.locator(".enquiry-timeline")).toContainText(note);
    await expect(customer.locator(".event-text b")).toHaveCount(0);
    expect(
      (await (await customer.request.get("/api/v1/me/try-on/jobs")).json())
        .total,
    ).toBe(0);
    await customer.goto(`/callback?product=${product.id}`);
    await customer
      .getByLabel("Note for the store", { exact: true })
      .fill("A duplicate must not overwrite the original note.");
    await customer
      .getByLabel(/^I agree to share my name, unverified mobile number/)
      .check();
    await customer
      .getByRole("button", { name: "Request a callback", exact: true })
      .click();
    await expect(
      customer.getByText(
        "You already have an active enquiry for this product. Open it to continue the conversation.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      customer.getByRole("link", { name: "Open my enquiry", exact: true }),
    ).toHaveAttribute("href", `/account/enquiries/${enquiryId}`);
    const unchanged = await (
      await customer.request.get(`/api/v1/me/enquiries/${enquiryId}`)
    ).json();
    expect(unchanged.events[0].text).toBe(note);
    const searchUrls: string[] = [],
      searchBodies: string[] = [];
    staffA.on("request", (request) => {
      if (request.url().includes("/enquiries")) {
        searchUrls.push(request.url());
        if (request.method() === "POST" && request.url().endsWith("/search"))
          searchBodies.push(request.postData() || "");
      }
    });
    await staffA.goto(`/staff?store=${storeIds[0]}&tab=enquiries`);
    await expect(
      staffA.getByRole("heading", { name: "Store enquiries.", exact: true }),
    ).toBeVisible();
    await expect(staffA.locator(".enquiry-counts strong").first()).toHaveText(
      "1",
    );
    const beforeOpen = await (
      await staffA.request.get(
        `/api/v1/stores/${storeIds[0]}/enquiries/${enquiryId}`,
      )
    ).json();
    expect(beforeOpen.status).toBe("NEW");
    expect(beforeOpen.assignee).toBeNull();
    expect(beforeOpen.updatedAt).toBe(unchanged.updatedAt);
    await staffA
      .getByLabel("Search this store's enquiries", { exact: true })
      .fill(phone);
    await staffA
      .getByRole("button", { name: "Search enquiries", exact: true })
      .click();
    await expect(
      staffA.getByRole("row").filter({ hasText: phone }),
    ).toHaveCount(1);
    expect(searchBodies.some((body) => body.includes(phone))).toBeTruthy();
    expect(
      searchUrls.every(
        (url) =>
          !url.includes(phone) && !url.includes(encodeURIComponent(phone)),
      ),
    ).toBeTruthy();
    await staffA
      .getByRole("button", {
        name: `Open enquiry for ${product.title} from ${name}`,
        exact: true,
      })
      .click();
    await expect(staffA.locator(".enquiry-contact dd").first()).toHaveText(
      staffNames[0],
    );
    await expect(staffA.locator(".ticket-status")).toHaveText("Open");
    await expect(
      staffA.getByLabel("New unassigned enquiries", { exact: true }),
    ).toHaveText("0");
    await staffB.goto(
      `/staff?store=${storeIds[0]}&tab=enquiries&enquiry=${enquiryId}`,
    );
    await expect(staffB.locator(".enquiry-contact dd").first()).toHaveText(
      staffNames[0],
    );
    const forbidden = await foreignStaff.request.get(
      `/api/v1/stores/${storeIds[0]}/enquiries/${enquiryId}`,
    );
    expect([403, 404]).toContain(forbidden.status());
    expect(await forbidden.text()).not.toContain(phone);
    expect(
      (await staffA.request.get(`/api/v1/me/enquiries/${enquiryId}`)).status(),
    ).toBe(404);
    const otherPassword = `Other-${randomUUID()}-aA9`;
    await mutate(stranger, "/auth/signup", "POST", {
      name: "Disposable Other Enquirer",
      countryCode: "+91",
      mobile: `95${Date.now().toString().slice(-8)}`,
      password: otherPassword,
      privacyAccepted: true,
      captchaToken: "local-development",
    });
    strangerAccount = { password: otherPassword };
    expect(
      (
        await stranger.request.get(`/api/v1/me/enquiries/${enquiryId}`)
      ).status(),
    ).toBe(404);
    await staffA
      .getByLabel("Customer-visible reply", { exact: true })
      .fill("The saree is available. What time suits you for a call?");
    await staffA
      .getByRole("button", { name: "Send customer reply", exact: true })
      .click();
    await expect(
      staffA.getByText("Customer-visible reply sent.", { exact: true }),
    ).toBeVisible();
    const internal = `INTERNAL-${suffix}: call handling for the store team only.`;
    await staffA
      .getByLabel("Internal note (store team only)", { exact: true })
      .fill(internal);
    await staffA
      .getByRole("button", { name: "Add internal note", exact: true })
      .click();
    await expect(
      staffA.getByText("Internal note added.", { exact: true }),
    ).toBeVisible();
    await staffA
      .getByLabel("Next status", { exact: true })
      .selectOption("AWAITING_CUSTOMER_RESPONSE");
    await staffA
      .getByLabel("Status reason (customer visible, optional)", { exact: true })
      .fill("Please reply with a convenient time.");
    await staffA
      .getByRole("button", { name: "Update status", exact: true })
      .click();
    await expect(staffA.locator(".ticket-status")).toHaveText(
      "Awaiting customer response",
    );
    await customer.goto(`/account/enquiries/${enquiryId}`);
    await expect(customer.locator(".ticket-status")).toHaveText(
      "Awaiting customer response",
    );
    const publicDetail = await (
      await customer.request.get(`/api/v1/me/enquiries/${enquiryId}`)
    ).json();
    expect(JSON.stringify(publicDetail)).not.toContain(internal);
    expect(publicDetail).not.toHaveProperty("assignee");
    expect(
      publicDetail.events.some((event: { type: string }) =>
        ["CLAIMED", "ASSIGNED", "NOTE"].includes(event.type),
      ),
    ).toBeFalsy();
    const reply = "Tomorrow at 5 pm works. <img src=x onerror=alert(1)>";
    await customer
      .getByLabel("Your reply to the store", { exact: true })
      .fill(reply);
    await customer
      .getByRole("button", { name: "Send reply", exact: true })
      .click();
    await expect(customer.locator(".ticket-status")).toHaveText(
      "Customer replied",
    );
    await expect(customer.locator(".event-text img")).toHaveCount(0);
    await staffA
      .getByRole("button", { name: "Refresh enquiry", exact: true })
      .click();
    await expect(staffA.locator(".ticket-status")).toHaveText(
      "Customer replied",
    );
    await expect(staffA.locator(".enquiry-timeline")).toContainText(reply);
    await staffA
      .getByLabel("Assign to", { exact: true })
      .selectOption(staffIds[1]);
    await staffA
      .getByLabel("Assignment reason (internal, optional)", { exact: true })
      .fill("Evening follow-up assigned to the next teammate.");
    await staffA
      .getByRole("button", { name: "Save assignment", exact: true })
      .click();
    await expect(staffA.locator(".enquiry-contact dd").first()).toHaveText(
      staffNames[1],
    );
    await staffB
      .getByRole("button", { name: "Refresh enquiry", exact: true })
      .click();
    await expect(staffB.locator(".enquiry-contact dd").first()).toHaveText(
      staffNames[1],
    );
    await staffB
      .getByLabel("Next status", { exact: true })
      .selectOption("CLOSED");
    await staffB
      .getByLabel("Closure outcome", { exact: true })
      .selectOption("CONTACTED");
    await staffB
      .getByLabel("Status reason (customer visible, optional)", { exact: true })
      .fill("We spoke and agreed the next follow-up.");
    await staffB
      .getByRole("button", { name: "Update status", exact: true })
      .click();
    await expect(staffB.locator(".ticket-status")).toHaveText("Closed");
    await customer.reload();
    await expect(customer.locator(".ticket-status")).toHaveText("Closed");
    await expect(
      customer.getByLabel("Your reply to the store", { exact: true }),
    ).toHaveCount(0);
    await expect(
      customer.getByRole("link", {
        name: "Start a new callback request",
        exact: true,
      }),
    ).toBeVisible();
    await staffB
      .getByLabel("Reopen assignee", { exact: true })
      .selectOption(staffIds[0]);
    await staffB
      .getByLabel("Reopen reason (customer visible)", { exact: true })
      .fill("The customer requested one more follow-up.");
    await staffB
      .getByRole("button", { name: "Reopen enquiry", exact: true })
      .click();
    await expect(staffB.locator(".ticket-status")).toHaveText("Open");
    await expect(staffB.locator(".enquiry-contact dd").first()).toHaveText(
      staffNames[0],
    );
    await staffB
      .getByLabel("Next status", { exact: true })
      .selectOption("CLOSED");
    await staffB
      .getByLabel("Closure outcome", { exact: true })
      .selectOption("CONTACTED");
    await staffB
      .getByRole("button", { name: "Update status", exact: true })
      .click();
    await expect(staffB.locator(".ticket-status")).toHaveText("Closed");
    await assertTextContrast(staffB);
    await customer.setViewportSize({ width: 360, height: 800 });
    await customer.reload();
    expect(
      await customer.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await assertTextContrast(customer);
    if (stateDirectory)
      await customer.screenshot({
        path: join(stateDirectory, "customer-enquiry-mobile.png"),
        fullPage: true,
      });
    await staffB.setViewportSize({ width: 360, height: 800 });
    expect(
      await staffB.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    const mobileOrder = await staffB
      .locator(".staff-enquiry-layout > *")
      .evaluateAll((elements) => elements.map((element) => element.className));
    expect(mobileOrder[0]).toContain("enquiry-operations");
    const mobilePositions = await staffB
      .locator(".staff-enquiry-layout > *")
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().top),
      );
    expect(mobilePositions[0]).toBeLessThan(mobilePositions[1]);
    await staffB
      .getByRole("link", { name: "Add internal note", exact: true })
      .click();
    await expect(
      staffB.locator(`[id="enquiry-internal-note-${enquiryId}"]`),
    ).toBeFocused();
    await staffB.keyboard.press("Tab");
    await expect(
      staffB.getByLabel("Internal note (store team only)", { exact: true }),
    ).toBeFocused();
    await staffB
      .locator(".staff-enquiry-detail")
      .evaluate((element) =>
        element.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    if (stateDirectory) {
      await staffB.screenshot({
        path: join(stateDirectory, "staff-enquiry-mobile.png"),
      });
      await staffB
        .locator(".enquiry-operations")
        .screenshot({
          path: join(stateDirectory, "staff-enquiry-operations-mobile.png"),
        });
      await staffB.screenshot({
        path: join(stateDirectory, "staff-enquiry-full-mobile.png"),
        fullPage: true,
      });
    }
    await mutate(customer, "/me", "DELETE", { password, confirm: true });
    customerDeleted = true;
    await staffB
      .getByRole("button", { name: "Refresh enquiry", exact: true })
      .click();
    await expect(staffB.locator(".enquiry-contact h2")).toHaveText(
      "Deleted customer",
    );
    await expect(
      staffB.getByLabel("Internal note (store team only)", { exact: true }),
    ).toHaveCount(0);
    await expect(
      staffB.getByRole("button", { name: "Reopen enquiry", exact: true }),
    ).toHaveCount(0);
    const redacted = await (
      await staffB.request.get(
        `/api/v1/stores/${storeIds[0]}/enquiries/${enquiryId}`,
      )
    ).json();
    expect(redacted.contact.phone).toBeNull();
    expect(
      redacted.events.every(
        (event: { text: string | null }) => event.text === null,
      ),
    ).toBeTruthy();
    expect(
      redacted.events.some(
        (event: { type: string }) => event.type === "ASSIGNED",
      ),
    ).toBeTruthy();
  } finally {
    if (customerCreated && !customerDeleted)
      await mutate(customer, "/me", "DELETE", { password, confirm: true });
    if (strangerAccount)
      await mutate(stranger, "/me", "DELETE", {
        password: strangerAccount.password,
        confirm: true,
      });
    for (const id of staffIds)
      await mutate(admin, `/admin/workforce/${id}`, "PATCH", {
        enabled: false,
      });
    for (const id of storeIds)
      await mutate(admin, `/stores/${id}`, "PATCH", { status: "ARCHIVED" });
    await Promise.all(contexts.map((context) => context.close()));
  }
});
