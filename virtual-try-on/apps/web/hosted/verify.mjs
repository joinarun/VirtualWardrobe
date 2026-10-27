#!/usr/bin/env node
// Deliberately separate from the required LOCAL_TEST/FIXTURE Playwright suite.
import { parseArgs } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { readFile, lstat, mkdtemp, chmod } from "node:fs/promises";
import { randomBytes, randomInt } from "node:crypto";
import {
  TARGET,
  PROFILE,
  SafeFailure,
  requireCheck,
  targetInventory,
  jsonFile,
  credentialBundle,
  actors,
  safePrivatePath,
  uploadCapability,
  privateDirectory,
  writePrivate,
  reserveLiveAction,
  safeFailure,
  fixedStateDirectory,
  assertSafeEnvironment,
  signupRecovery,
  terminalObservation,
  safeActivity,
} from "./policy.mjs";
import { bindOriginalPut } from "./put-observation.mjs";

const WEB = fileURLToPath(new URL("../", import.meta.url));
const STATE = resolve(WEB, "../../work/gcp");
const options = {
  run: { type: "boolean", default: false },
  "allow-one-live-job": { type: "boolean", default: false },
  "resume-live-job": { type: "boolean", default: false },
  inventory: {
    type: "string",
    default: resolve(WEB, "../../work/gcp/deployment.json"),
  },
  credentials: {
    type: "string",
    default: resolve(
      WEB,
      "../../work/gcp/demo-credentials-virtualwardrobe-demo-v1.json",
    ),
  },
  "work-directory": { type: "string", default: STATE },
};
const mask =
  "input, textarea, select, .recovery-codes, .credential-card, .staff-identity, .enquiry-contact, .detail-list, .customer-account h1, .event-actor, .event-transition, .enquiry-customer-context, .contact-phone";
export function plan() {
  return {
    schemaVersion: 1,
    project: TARGET.project,
    mode: "PLAN",
    network: false,
    mutations: false,
    newLiveJobs: 0,
    profile: PROFILE,
    execution:
      "--run executes real auth/CAPTCHA/callback/security; --allow-one-live-job additionally reserves one durable paid action; --resume-live-job never creates a new job",
    checks: [
      "ordinary_signup_once",
      "hosting_session_csrf",
      "catalog_and_store_scope",
      "callback_conversation_history",
      "signed_put_cors_replay_412_before_finalize",
      "real_google_job_optional",
      "private_save_relogin_download_delete",
    ],
    privacy:
      "Protected credentials, masked screenshots, safe aggregate receipts; no traces/HAR/cookies/capability URLs or raw errors",
  };
}
function isPath(response, path) {
  return new URL(response.url()).pathname === `/api/v1${path}`;
}
async function read(page, path, status = 200) {
  const response = await page.request.get(`/api/v1${path}`, {
    maxRedirects: 0,
  });
  requireCheck(
    response.status() === status,
    `API_READ_STATUS_${response.status()}_EXPECTED_${status}`,
  );
  return status === 200 ? response.json() : response;
}
async function signIn(page, user, progress = () => {}) {
  progress("READ_PRELOGIN_CSRF");
  const before = await read(page, "/auth/csrf");
  progress("NAVIGATE_LOGIN");
  await page.goto(user.kind === "CUSTOMER" ? "/account/login" : "/staff/login");
  progress("IDENTIFIER_FIELD");
  await page
    .getByLabel(
      user.kind === "CUSTOMER"
        ? "Mobile number with country code"
        : "Email address",
      { exact: true },
    )
    .fill(user.identifier);
  progress("PASSWORD_FIELD");
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  progress("SUBMIT_LOGIN");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  progress("WAIT_SIGNED_IN_VIEW");
  await page
    .locator(user.kind === "CUSTOMER" ? ".customer-account" : ".workspace-main")
    .waitFor();
  progress("READ_POSTLOGIN_SESSION");
  const session = await read(page, "/auth/session");
  progress("READ_POSTLOGIN_CSRF");
  const after = await read(page, "/auth/csrf");
  requireCheck(
    session.user?.id === user.id &&
      !session.user.passwordChangeRequired &&
      before.token !== after.token,
    "SESSION_OR_CSRF_CONTINUITY_FAILED",
  );
  progress("OLD_CSRF_LOGOUT_AND_RETAINED_SESSION");
  const stale = await page.request.post("/api/v1/auth/logout", {
    data: {},
    headers: { [before.headerName]: before.token },
  });
  requireCheck(
    stale.status() === 403 &&
      (await read(page, "/auth/session")).user?.id === user.id,
    "OLD_CSRF_TOKEN_NOT_REJECTED",
  );
  progress("SECURE_COOKIE_POLICY");
  const cookies = await page.context().cookies(TARGET.origin);
  requireCheck(
    cookies.some(
      (cookie) =>
        cookie.name === "__session" &&
        cookie.httpOnly &&
        cookie.secure &&
        cookie.sameSite === "Lax",
    ),
    "SECURE_SESSION_COOKIE_MISSING",
  );
  progress("AUTH_CACHE_POLICY");
  const response = await page.request.get("/api/v1/auth/session");
  requireCheck(
    /no-store/.test(response.headers()["cache-control"] || ""),
    "AUTH_CACHE_POLICY_FAILED",
  );
}
async function screenshot(page, directory, name) {
  await page.screenshot({
    path: join(directory, name),
    mask: [page.locator(mask)],
    animations: "disabled",
  });
  await chmod(join(directory, name), 0o600);
}
async function pageContext(browser, errors) {
  const context = await browser.newContext({
    baseURL: TARGET.origin,
    viewport: PROFILE.viewport,
    deviceScaleFactor: PROFILE.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  context.setDefaultTimeout(60000);
  context.setDefaultNavigationTimeout(60000);
  const page = await context.newPage();
  page.on("pageerror", () => {
    errors.count++;
  }); // Never retain or print the message/stack.
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: PROFILE.latencyMs,
    downloadThroughput: (PROFILE.downloadMbps * 1e6) / 8,
    uploadThroughput: (PROFILE.uploadMbps * 1e6) / 8,
    connectionType: "cellular4g",
  });
  await client.send("Emulation.setCPUThrottlingRate", {
    rate: PROFILE.cpuSlowdown,
  });
  return { context, page, client };
}
async function signupOnce(browser, work, revision, errors) {
  const path = join(work, "demo-credentials-hosted-signup.json");
  try {
    const previous = await jsonFile(path, true);
    return {
      status:
        previous.state === "CREATED" && previous.revision === revision
          ? "PASSED_PREVIOUS"
          : "BLOCKED_PREVIOUS_ATTEMPT",
      attemptedNow: false,
    };
  } catch (error) {
    if (
      !(error instanceof SafeFailure) ||
      error.code !== "INPUT_FILE_UNAVAILABLE"
    )
      throw error;
  }
  const input = {
    schemaVersion: 1,
    revision,
    state: "PREPARED",
    name: "Hosted fictional signup",
    phone: `+9192${String(randomInt(100000000)).padStart(8, "0")}`,
    password: `Hosted-${randomBytes(32).toString("base64url")}-aA9`,
    recoveryCodes: [],
  };
  await writePrivate(path, input, true);
  const { context, page } = await pageContext(browser, errors);
  let attempted = false;
  try {
    await page.goto("/account/signup");
    await page.getByLabel("Your name", { exact: true }).fill(input.name);
    await page
      .getByLabel("Mobile number", { exact: true })
      .fill(input.phone.slice(3));
    await page.getByLabel("Password", { exact: true }).fill(input.password);
    await page
      .getByLabel("Confirm password", { exact: true })
      .fill(input.password);
    await page
      .getByLabel("I have read and agree to the account privacy notice.", {
        exact: true,
      })
      .check();
    input.state = "ATTEMPTED";
    await writePrivate(path, input);
    attempted = true;
    const submitted = page
      .waitForResponse(
        (response) =>
          isPath(response, "/auth/signup") &&
          response.request().method() === "POST",
        { timeout: 25000 },
      )
      .catch(() => null);
    await page
      .getByRole("button", { name: "Create my account", exact: true })
      .click();
    const response = await submitted;
    if (response && [200, 201].includes(response.status())) {
      input.recoveryCodes = signupRecovery(
        response.status(),
        await response.json(),
        input.phone,
      );
      input.state = "CREATED";
      await writePrivate(path, input);
      await page
        .getByRole("heading", { name: "Keep a way back in.", exact: true })
        .waitFor();
      return { status: "PASSED", attemptedNow: true };
    }
    input.state = "BLOCKED";
    await writePrivate(path, input);
    return {
      status: "BLOCKED_SIGNUP_REJECTED_OR_CHALLENGE",
      attemptedNow: true,
      httpStatus: response?.status() || null,
    };
  } catch {
    if (!attempted || input.state === "CREATED")
      throw new SafeFailure("SIGNUP_UI_PREPARATION_OR_CONFIRMATION_FAILED");
    input.state = "BLOCKED";
    await writePrivate(path, input);
    return { status: "BLOCKED_SIGNUP_OUTCOME_UNCONFIRMED", attemptedNow: true };
  } finally {
    await context.close();
  }
}
async function callbackJourney(pages, who, product, output) {
  const { customer, staff, teammate, foreign, other } = pages;
  await customer.goto(`/products/${product.id}`);
  await customer
    .getByRole("link", { name: "Request a callback", exact: true })
    .click();
  await customer
    .getByRole("heading", { name: "Let the store reach out.", exact: true })
    .waitFor();
  requireCheck(
    (await customer
      .getByLabel("Mobile number", { exact: true })
      .inputValue()) === who.customer.identifier,
    "CALLBACK_CONTACT_MISMATCH",
  );
  await customer
    .getByLabel("Note for the store", { exact: true })
    .fill(
      "Hosted fictional demonstration. Please reply in this app; do not call the sample number.",
    );
  await customer
    .getByLabel(/^I agree to share my name, unverified mobile number/)
    .check();
  let requestOnlyProduct = false;
  const created = customer
    .waitForResponse(
      (response) =>
        isPath(response, "/me/enquiries") &&
        response.request().method() === "POST",
    )
    .catch(() => null);
  await customer
    .getByRole("button", { name: "Request a callback", exact: true })
    .click();
  const response = await created;
  requireCheck(response?.ok(), "CALLBACK_CREATE_FAILED");
  const body = response.request().postDataJSON();
  requestOnlyProduct = Object.keys(body).every((key) =>
    ["productId", "consent", "note"].includes(key),
  );
  const record = await response.json();
  requireCheck(
    record.created && requestOnlyProduct,
    "CALLBACK_WAS_NOT_NEW_OR_SHARED_PREVIEW",
  );
  const id = record.enquiry.id;
  await customer
    .getByRole("link", { name: "Open my enquiry", exact: true })
    .click();
  await customer
    .locator(".ticket-status")
    .filter({ hasText: /^New$/ })
    .waitFor();
  await customer.goto(`/callback?product=${product.id}`);
  await customer
    .getByLabel(/^I agree to share my name, unverified mobile number/)
    .check();
  await customer
    .getByRole("button", { name: "Request a callback", exact: true })
    .click();
  await customer
    .getByText(
      "You already have an active enquiry for this product. Open it to continue the conversation.",
      { exact: true },
    )
    .waitFor();
  await staff.goto(`/staff?store=${who.store}&tab=enquiries`);
  await staff.locator(".enquiry-table").waitFor();
  requireCheck(
    Number(
      await staff.locator(".enquiry-counts strong").first().textContent(),
    ) >= 1,
    "STORE_NOTIFICATION_MISSING",
  );
  await staff.goto(`/staff?store=${who.store}&tab=enquiries&enquiry=${id}`);
  await staff
    .locator(".ticket-status")
    .filter({ hasText: /^Open$/ })
    .waitFor();
  requireCheck(
    (await staff.locator(".enquiry-contact dd").first().textContent()) ===
      who.staff.name,
    "FIRST_OPEN_CLAIM_FAILED",
  );
  await teammate.goto(`/staff?store=${who.store}&tab=enquiries&enquiry=${id}`);
  await teammate
    .locator(".ticket-status")
    .filter({ hasText: /^Open$/ })
    .waitFor();
  requireCheck(
    (await teammate.locator(".enquiry-contact dd").first().textContent()) ===
      who.staff.name,
    "CLAIM_WINNER_NOT_PRESERVED",
  );
  for (const [page, path] of [
    [foreign, `/stores/${who.store}/enquiries/${id}`],
    [other, `/me/enquiries/${id}`],
  ]) {
    const denied = await page.request.get(`/api/v1${path}`, {
      maxRedirects: 0,
    });
    requireCheck(
      [403, 404].includes(denied.status()) &&
        !(await denied.text()).includes(who.customer.identifier),
      "ENQUIRY_SCOPE_DENIAL_FAILED",
    );
  }
  await staff
    .getByLabel("Customer-visible reply", { exact: true })
    .fill(
      "This fictional piece is available. Please reply here without a phone call.",
    );
  await staff
    .getByRole("button", { name: "Send customer reply", exact: true })
    .click();
  await staff
    .getByText("Customer-visible reply sent.", { exact: true })
    .waitFor();
  const internal = `Hosted internal handling ${randomBytes(8).toString("hex")}`;
  await staff
    .getByLabel("Internal note (store team only)", { exact: true })
    .fill(internal);
  await staff
    .getByRole("button", { name: "Add internal note", exact: true })
    .click();
  await staff.getByText("Internal note added.", { exact: true }).waitFor();
  await staff
    .getByLabel("Next status", { exact: true })
    .selectOption("AWAITING_CUSTOMER_RESPONSE");
  await staff
    .getByRole("button", { name: "Update status", exact: true })
    .click();
  await staff
    .locator(".ticket-status")
    .filter({ hasText: /^Awaiting customer response$/ })
    .waitFor();
  await customer.goto(`/account/enquiries/${id}`);
  await customer
    .locator(".ticket-status")
    .filter({ hasText: /^Awaiting customer response$/ })
    .waitFor();
  const visible = await read(customer, `/me/enquiries/${id}`);
  requireCheck(
    !JSON.stringify(visible).includes(internal) &&
      !visible.assignee &&
      !visible.events.some((event) =>
        ["NOTE", "ASSIGNED", "CLAIMED"].includes(event.type),
      ),
    "INTERNAL_CONVERSATION_LEAKED",
  );
  await customer
    .getByLabel("Your reply to the store", { exact: true })
    .fill("Thank you. This hosted demonstration is complete.");
  await customer
    .getByRole("button", { name: "Send reply", exact: true })
    .click();
  await customer
    .locator(".ticket-status")
    .filter({ hasText: /^Customer replied$/ })
    .waitFor();
  await screenshot(customer, output, "customer-conversation.png");
  await staff
    .getByRole("button", { name: "Refresh enquiry", exact: true })
    .click();
  await staff
    .locator(".ticket-status")
    .filter({ hasText: /^Customer replied$/ })
    .waitFor();
  await staff
    .getByLabel("Assign to", { exact: true })
    .selectOption(who.teammate.id);
  await staff
    .getByLabel("Assignment reason (internal, optional)", { exact: true })
    .fill("Hosted demonstration handover.");
  await staff
    .getByRole("button", { name: "Save assignment", exact: true })
    .click();
  await staff
    .getByText("Assignment updated and recorded in history.", { exact: true })
    .waitFor();
  await teammate
    .getByRole("button", { name: "Refresh enquiry", exact: true })
    .click();
  requireCheck(
    (await read(teammate, `/stores/${who.store}/enquiries/${id}`)).assignee
      .id === who.teammate.id,
    "REASSIGNMENT_FAILED",
  );
  await teammate
    .getByLabel("Next status", { exact: true })
    .selectOption("CLOSED");
  await teammate
    .getByLabel("Closure outcome", { exact: true })
    .selectOption("CONTACTED");
  await teammate
    .getByRole("button", { name: "Update status", exact: true })
    .click();
  await teammate
    .locator(".ticket-status")
    .filter({ hasText: /^Closed$/ })
    .waitFor();
  const history = await read(teammate, `/stores/${who.store}/enquiries/${id}`);
  requireCheck(
    history.events.some(
      (event) =>
        event.type === "ASSIGNED" && event.toAssignee?.id === who.teammate.id,
    ) && history.outcome === "CONTACTED",
    "ASSIGNMENT_HISTORY_MISSING",
  );
  await screenshot(teammate, output, "staff-triage-history.png");
  await customer.reload();
  await customer
    .locator(".ticket-status")
    .filter({ hasText: /^Closed$/ })
    .waitFor();
  return {
    callbackWithoutPreview: true,
    duplicatePreserved: true,
    claimWinnerPreserved: true,
    internalNotePrivate: true,
    crossScopeDenied: true,
    closedWithHistory: true,
  };
}
async function liveJourney(
  pages,
  who,
  product,
  output,
  work,
  revision,
  resume,
  observe,
  progress = () => {},
) {
  const { customer, other, staff, customerClient } = pages;
  progress("READ_ORIGINAL_GALLERY");
  const original = await read(customer, "/me/try-on/gallery");
  let journal,
    sourceId = null,
    replayProof = null;
  if (resume) {
    progress("READ_RESUME_JOURNAL");
    const value = await jsonFile(join(work, "hosted-live-job.json"), true);
    requireCheck(
      value.project === TARGET.project &&
        /^[a-f0-9-]{36}$/.test(value.jobId || ""),
      "NO_RESUMABLE_LIVE_JOB",
    );
    journal = { path: join(work, "hosted-live-job.json"), value };
  } else {
    progress("READ_OWNED_FIXTURE");
    const photoPath = join(WEB, "public/demo/hero-emerald.png"),
      info = await lstat(photoPath);
    requireCheck(
      info.isFile() &&
        !info.isSymbolicLink() &&
        info.size > 0 &&
        info.size <= 10 * 1024 * 1024,
      "OWNED_PERSON_FIXTURE_UNAVAILABLE",
    );
    const photo = await readFile(photoPath);
    let capResolve,
      capError = null,
      replayError = null,
      capability = null;
    const capReady = new Promise((resolveCap) => {
      capResolve = resolveCap;
    });
    const capture = async (response) => {
      if (
        isPath(response, "/me/try-on/uploads") &&
        response.request().method() === "POST"
      ) {
        try {
          requireCheck(response.ok(), "SOURCE_AUTHORIZATION_FAILED");
          capability = uploadCapability(
            await response.json(),
            photo.length,
            "image/png",
          );
          sourceId = capability.uploadId;
          capResolve(capability);
        } catch (error) {
          capError = safeFailure(error);
          capResolve(null);
        }
      }
    };
    progress("REGISTER_UPLOAD_OBSERVER");
    const putObserver = bindOriginalPut({
      capabilityReady: capReady,
      expectedBytes: photo.length,
      origin: TARGET.origin,
    });
    requireCheck(customerClient, "WIRE_OBSERVER_SESSION_UNAVAILABLE");
    customerClient.on(
      "Network.requestWillBeSent",
      putObserver.onNetworkRequest,
    );
    customerClient.on(
      "Network.requestWillBeSentExtraInfo",
      putObserver.onNetworkExtraInfo,
    );
    customerClient.on(
      "Network.responseReceived",
      putObserver.onNetworkResponse,
    );
    customer.on("response", capture);
    customer.on("request", putObserver.onPlaywrightRequest);
    const finalizePattern =
      /\/api\/v1\/me\/try-on\/uploads\/[a-f0-9-]{36}\/finalize$/;
    let replayAttempted = false;
    await customer.route(finalizePattern, async (route) => {
      if (replayAttempted) {
        await route.continue().catch(() => {});
        return;
      }
      replayAttempted = true;
      try {
        const value = await Promise.race([
          capReady,
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(new SafeFailure("SOURCE_CAPABILITY_CAPTURE_TIMEOUT")),
              15000,
            ),
          ),
        ]);
        requireCheck(
          value && !capError && route.request().url().includes(value.uploadId),
          "SOURCE_CAPABILITY_CAPTURE_FAILED",
        );
        // Await the exactly-bound original request's real wire metadata/status.
        // Fetch interception can omit automatic Content-Length from allHeaders().
        progress("WAIT_ORIGINAL_PUT_WIRE_PROOF");
        const originalPut = await putObserver.wait(15000);
        // The raw PUT has completed, and this real finalize request has not reached the server yet.
        progress("REPLAY_EXISTING_RAW_PUT");
        const status = await customer.evaluate(
          async ({ url, headers, base64 }) => {
            const bytes = Uint8Array.from(atob(base64), (character) =>
              character.charCodeAt(0),
            );
            const response = await fetch(url, {
              method: "PUT",
              headers,
              credentials: "omit",
              body: new Blob([bytes], { type: "image/png" }),
            });
            return response.status; // Never read an XML error that may echo the signed URL/object key.
          },
          {
            url: value.uploadUrl,
            headers: value.headers,
            base64: photo.toString("base64"),
          },
        );
        const uploadDiagnostics = { ...originalPut, replayStatus: status };
        journal.value = { ...journal.value, uploadDiagnostics };
        await writePrivate(journal.path, journal.value);
        observe({
          phase: "SIGNED_UPLOAD",
          uploadDiagnostics,
          newJobSubmitted: false,
          lifecycle: "NOT_FINISHED",
        });
        requireCheck(
          originalPut.originalStatus >= 200 &&
            originalPut.originalStatus < 300 &&
            originalPut.wireExtraInfoObserved &&
            originalPut.lengthPresent &&
            originalPut.lengthMatch &&
            originalPut.originMatch &&
            originalPut.cookieAbsent &&
            originalPut.csrfAbsent &&
            status === 412,
          "SIGNED_PUT_REPLAY_OR_LENGTH_CORS_FAILED",
        );
        replayProof = {
          ...uploadDiagnostics,
          browserBlobLength: true,
          originalPutWithoutCookiesOrCsrf: true,
        };
        progress("CONTINUE_GENUINE_FINALIZE");
        await route.continue(); // Genuine request/body/headers, no mocked finalization response.
      } catch (error) {
        replayError = safeFailure(error);
        await route.abort("failed").catch(() => {});
      }
    });
    progress("NAVIGATE_TRY_ON");
    await customer.goto(`/try-on?product=${product.id}`);
    progress("WAIT_TRY_ON_HEADING");
    await customer
      .getByRole("heading", {
        name: "Picture this piece, your way.",
        exact: true,
      })
      .waitFor();
    progress("WAIT_EVALUATION_DISCLOSURE");
    await customer
      .getByLabel("AI service disclosure")
      .filter({ hasText: /EVALUATION DEMO/i })
      .waitFor();
    progress("SELECT_OWNED_PHOTO");
    await customer
      .getByLabel("Choose a photo", { exact: true })
      .setInputFiles(photoPath);
    progress("ADULT_CONSENT");
    await customer
      .getByLabel("I am an adult (18 or older).", { exact: true })
      .check();
    progress("OWN_PHOTO_CONSENT");
    await customer
      .getByLabel("This is my own photo, and it shows only me.", {
        exact: true,
      })
      .check();
    progress("PROCESSING_CONSENT");
    await customer
      .getByLabel(/^I consent to the processing and retention/)
      .check();
    progress("MASKED_CONSENT_SCREENSHOT");
    await screenshot(customer, output, "live-consent-masked.png");
    progress("RESERVE_SINGLE_PAID_ACTION");
    journal = await reserveLiveAction(work, revision); // Durable BEFORE the sole paid UI action, including ambiguous outcomes.
    let creates = 0;
    const createIntents = new Set();
    const countCreate = (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/me/try-on/jobs"
      ) {
        creates++;
        try {
          createIntents.add(request.postDataJSON().idempotencyKey);
        } catch {
          createIntents.add(null);
        }
      }
    };
    customer.on("request", countCreate);
    try {
      const responsePromise = customer
        .waitForResponse(
          (response) =>
            isPath(response, "/me/try-on/jobs") &&
            response.request().method() === "POST" &&
            response.status() !== 403,
          { timeout: 120000 },
        )
        .catch(() => null);
      progress("CLICK_CREATE_ONCE");
      await customer
        .getByRole("button", { name: "Create my AI preview", exact: true })
        .click();
      progress("WAIT_JOB_CREATE_RESPONSE");
      const response = await responsePromise;
      requireCheck(
        !replayError &&
          replayProof &&
          response?.ok() &&
          creates >= 1 &&
          creates <= 2 &&
          createIntents.size === 1 &&
          !createIntents.has(null) &&
          !createIntents.has(undefined),
        replayError || "LIVE_SUBMISSION_OUTCOME_UNCONFIRMED",
      );
      const job = await response.json();
      requireCheck(/^[a-f0-9-]{36}$/.test(job.id || ""), "LIVE_JOB_ID_MISSING");
      journal.value = {
        ...journal.value,
        state: "JOB_CREATED",
        jobId: job.id,
        sourceId,
      };
      await writePrivate(journal.path, journal.value);
    } finally {
      customer.off("request", countCreate);
      customer.off("response", capture);
      customer.off("request", putObserver.onPlaywrightRequest);
      customerClient.off(
        "Network.requestWillBeSent",
        putObserver.onNetworkRequest,
      );
      customerClient.off(
        "Network.requestWillBeSentExtraInfo",
        putObserver.onNetworkExtraInfo,
      );
      customerClient.off(
        "Network.responseReceived",
        putObserver.onNetworkResponse,
      );
      putObserver.dispose();
      await customer.unroute(finalizePattern);
      capability = null;
    }
  }
  progress("POLL_EXISTING_JOB");
  const id = journal.value.jobId,
    observed = new Set(),
    started = Date.now();
  let job;
  while (Date.now() - started < 210000) {
    job = await read(customer, `/me/try-on/jobs/${id}`);
    observed.add(job.state);
    if (!["QUEUED", "RUNNING"].includes(job.state)) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1500));
  }
  const timing = terminalObservation(job, journal.value, observed, started);
  observe({ ...timing, replay: replayProof, lifecycle: "NOT_FINISHED" });
  journal.value = { ...journal.value, observation: timing };
  await writePrivate(journal.path, journal.value);
  requireCheck(
    job?.state === "SUCCEEDED" &&
      job.result &&
      job.provider === "google" &&
      job.model === TARGET.model &&
      job.evaluationDemo &&
      !job.demo,
    "LIVE_JOB_NOT_CONFIRMED_SUCCESS",
  );
  requireCheck(
    Number.isFinite(timing.serverJobCompletionMs) &&
      timing.serverJobCompletionMs >= 0 &&
      timing.serverJobCompletionMs <= 180000,
    "SERVER_JOB_DEADLINE_NOT_MET",
  );
  journal.value = {
    ...journal.value,
    state: "SUCCEEDED",
    attempts: job.attempts,
  };
  await writePrivate(journal.path, journal.value);
  if (sourceId || journal.value.sourceId)
    await read(
      customer,
      `/private-media/${sourceId || journal.value.sourceId}/content`,
      404,
    );
  for (const page of [other, staff]) {
    await read(page, `/me/try-on/jobs/${id}`, 404);
    await read(
      page,
      safePrivatePath(job.result.imageUrl).slice("/api/v1".length),
      404,
    );
  }
  const privateResponse = await customer.request.get(
    safePrivatePath(job.result.imageUrl),
    { maxRedirects: 0 },
  );
  requireCheck(
    privateResponse.status() === 302 &&
      /no-store/.test(privateResponse.headers()["cache-control"] || ""),
    "PRIVATE_IMAGE_CACHE_POLICY_FAILED",
  );
  progress("VIEW_SUCCEEDED_JOB");
  await customer.goto(`/account/previews/${id}`);
  await customer
    .getByRole("heading", { name: "Preview ready", exact: true })
    .waitFor();
  await customer.waitForFunction(() => {
    const image = document.querySelector(".private-preview-image img");
    return image?.complete && image.naturalWidth > 0;
  });
  await screenshot(customer, output, "live-evaluation-preview.png");
  if (!job.result.saved) {
    progress("SAVE_GALLERY");
    await customer
      .getByRole("button", { name: "Save to my gallery", exact: true })
      .click();
    await customer
      .getByRole("link", { name: "Open saved gallery", exact: true })
      .waitFor({ timeout: 60000 });
  }
  job = await read(customer, `/me/try-on/jobs/${id}`);
  const savedId = job.result.id;
  await customer.goto("/account");
  await customer.getByRole("button", { name: "Sign out", exact: true }).click();
  await customer.waitForURL(TARGET.origin + "/");
  await signIn(customer, who.customer, (stage) => progress("RELOGIN_" + stage));
  await customer.goto("/account/gallery");
  const card = customer
    .locator(".wardrobe-card")
    .filter({ has: customer.locator(`a[href="/account/previews/${id}"]`) });
  await card.waitFor();
  await card.getByRole("link", { name: "Open preview", exact: true }).click();
  await customer
    .getByRole("heading", { name: "Preview ready", exact: true })
    .waitFor();
  progress("DOWNLOAD_PRIVATE_RESULT");
  const downloaded = customer.waitForEvent("download").catch(() => null);
  await customer
    .getByRole("link", { name: "Download preview", exact: true })
    .click();
  const download = await downloaded;
  requireCheck(
    download &&
      download.suggestedFilename() === "virtualwardrobe-preview.jpg" &&
      !(await download.failure()),
    "PRIVATE_DOWNLOAD_FAILED",
  );
  await download.saveAs(join(output, "owned-evaluation-preview.jpg"));
  await chmod(join(output, "owned-evaluation-preview.jpg"), 0o600);
  progress("DELETE_ONLY_NEW_RESULT");
  await customer.goto("/account/gallery");
  await customer
    .locator(".wardrobe-card")
    .filter({ has: customer.locator(`a[href="/account/previews/${id}"]`) })
    .getByRole("button", {
      name: `Delete saved preview of ${job.product.title}`,
      exact: true,
    })
    .click();
  await customer
    .getByRole("button", { name: "Confirm gallery deletion", exact: true })
    .click();
  let gallery;
  for (let attempt = 0; attempt < 10; attempt++) {
    gallery = await read(customer, "/me/try-on/gallery");
    if (!gallery.items.some((item) => item.jobId === id)) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  requireCheck(
    !gallery.items.some((item) => item.jobId === id) &&
      original.items
        .filter((item) => item.jobId !== id)
        .every((item) =>
          gallery.items.some((current) => current.id === item.id),
        ),
    "ORIGINAL_GALLERY_NOT_PRESERVED",
  );
  await read(customer, `/private-media/${savedId}/content`, 404);
  journal.value = { ...journal.value, state: "RESULT_DELETED" };
  await writePrivate(journal.path, journal.value);
  return {
    newJobSubmitted: !resume,
    replay: replayProof || "PREVIOUS_ATTEMPT_JOURNAL",
    ...timing,
    terminal: job.state,
    attempts: job.attempts,
    lifecycleWorkflowMs: Date.now() - started,
    provider: job.provider,
    model: job.model,
    evaluationDemo: true,
    humanQualityApproved: false,
    privateDenied: true,
    sourceReadDenied: true,
    savedAcrossLogin: true,
    downloaded: true,
    resultDeleted: true,
    originalGalleryPreserved: true,
  };
}

export async function main(argv = process.argv.slice(2)) {
  process.umask(0o077);
  try {
    assertSafeEnvironment(process.env);
  } catch {
    console.log(
      JSON.stringify({ status: "FAILED", code: "UNSAFE_DEBUG_ENVIRONMENT" }),
    );
    return 1;
  }
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options }));
  } catch {
    console.log(
      JSON.stringify({ status: "FAILED", code: "INVALID_ARGUMENTS" }),
    );
    return 1;
  }
  if (!values.run) {
    console.log(JSON.stringify(plan(), null, 2));
    return 0;
  }
  const report = {
    schemaVersion: 1,
    project: TARGET.project,
    status: "RUNNING",
    startedAt: new Date().toISOString(),
    executionMode: values["allow-one-live-job"]
      ? "ONE_NEW_LIVE_JOB"
      : values["resume-live-job"]
        ? "EXISTING_JOB_ONLY"
        : "AUTH_CALLBACK_ONLY",
    profile: PROFILE,
    checks: [],
    humanQualityApproved: false,
  };
  let browser,
    output = null,
    phase = "PREFLIGHT";
  const contexts = [],
    errors = { count: 0 };
  const step = async (code, action) => {
    phase = code;
    report.activity = safeActivity("GENERAL", code);
    const start = Date.now();
    const result = await action();
    report.checks.push({
      code,
      status: "PASSED",
      elapsedMs: Date.now() - start,
    });
    return result;
  };
  try {
    requireCheck(
      !(values["allow-one-live-job"] && values["resume-live-job"]),
      "CONFLICTING_LIVE_OPTIONS",
    );
    values["work-directory"] = fixedStateDirectory(
      values["work-directory"],
      STATE,
    );
    const inventory = targetInventory(await jsonFile(values.inventory)),
      bundle = credentialBundle(await jsonFile(values.credentials, true)),
      who = actors(bundle);
    report.revision = inventory.source_revision;
    await privateDirectory(values["work-directory"]);
    output = await mkdtemp(
      join(values["work-directory"], "hosted-verification-"),
    );
    const { chromium } = await import("@playwright/test");
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    report.runtime = {
      nodeVersion: process.versions.node,
      platform: process.platform,
      architecture: process.arch,
      browserVersion: browser.version(),
      explicitBrowserExecutable: Boolean(
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      ),
      persistentUserProfile: false,
    };
    const entries = await Promise.all(
      Array.from({ length: 5 }, () => pageContext(browser, errors)),
    );
    contexts.push(...entries.map((entry) => entry.context));
    const [customer, other, staff, teammate, foreign] = entries.map(
        (entry) => entry.page,
      ),
      pages = {
        customer,
        other,
        staff,
        teammate,
        foreign,
        customerClient: entries[0].client,
      };
    const auth = await read(customer, "/auth/config"),
      provider = await read(customer, "/try-on/config");
    requireCheck(
      auth.captcha?.mode === "RECAPTCHA_ENTERPRISE" &&
        auth.signupEnabled &&
        provider.mode === "EVALUATION_DEMO" &&
        provider.provider === "google" &&
        provider.model === TARGET.model,
      "HOSTED_REAL_SERVICE_CONFIG_MISMATCH",
    );
    if (values["allow-one-live-job"])
      requireCheck(
        provider.enabled &&
          Number(provider.limits.dailyBudgetUsd) <= 5 &&
          provider.limits.customerDaily <= 5 &&
          provider.limits.globalDaily <= 100,
        "LIVE_MODE_OR_QUOTA_UNSAFE",
      );
    report.signup = await step("ORDINARY_SIGNUP_ATTEMPT", () =>
      signupOnce(browser, values["work-directory"], report.revision, errors),
    );
    await step("SECURE_HOSTING_LOGIN_SESSIONS", async () => {
      for (const key of ["customer", "other", "staff", "teammate", "foreign"])
        await signIn(pages[key], who[key], (stage) => {
          report.activity = safeActivity(key.toUpperCase(), stage);
        });
    });
    let product;
    await step("OWNED_CATALOG_AND_SOURCE_SCOPE", async () => {
      const list = await read(
          customer,
          `/products?storeId=${who.store}&size=50`,
        ),
        enquiries = await read(customer, "/me/enquiries?size=50");
      const active = new Set(
        enquiries.items
          .filter((item) => item.status !== "CLOSED")
          .map((item) => item.product.id),
      );
      product = list.items.find(
        (item) =>
          /Ruby/i.test(item.title) &&
          /occasion/i.test(item.title) &&
          item.status === "PUBLISHED" &&
          item.availability === "AVAILABLE" &&
          item.tryOnEnabled &&
          !active.has(item.id),
      );
      requireCheck(product, "OWNED_RUBY_OCCASION_UNAVAILABLE");
      await customer.goto(`/products/${product.id}`);
      await customer
        .getByRole("heading", { name: product.title, exact: true })
        .waitFor();
      await customer.waitForFunction(() => {
        const image = document.querySelector(".detail-main-image img");
        return image?.complete && image.naturalWidth > 0;
      });
      const cover = await customer.request.get(product.coverUrl, {
        maxRedirects: 0,
      });
      requireCheck(
        cover.status() === 302 &&
          /max-age=240/.test(cover.headers()["cache-control"] || ""),
        "PUBLIC_MEDIA_CACHE_POLICY_FAILED",
      );
      await screenshot(customer, output, "owned-catalog-mobile.png");
      for (const path of ["/internal", "/internal/tasks/try-on"]) {
        const response = await fetch(new URL(path, inventory.api_url), {
          redirect: "manual",
          signal: AbortSignal.timeout(30000),
        });
        requireCheck(
          response.status === 404,
          "PUBLIC_INTERNAL_ROUTE_NOT_MASKED",
        );
        await response.arrayBuffer();
      }
    });
    report.enquiry = values["resume-live-job"]
      ? { status: "NOT_REPEATED_ON_JOB_RESUME" }
      : await step("ACTUAL_CALLBACK_AND_STAFF_HISTORY", () =>
          callbackJourney(pages, who, product, output),
        );
    if (values["allow-one-live-job"] || values["resume-live-job"])
      report.live = await step("AUTHORIZED_REAL_TRYON_LIFECYCLE", () =>
        liveJourney(
          pages,
          who,
          product,
          output,
          values["work-directory"],
          report.revision,
          values["resume-live-job"],
          (observation) => {
            report.live = observation;
          },
          (stage) => {
            report.activity = safeActivity("CUSTOMER", stage);
          },
        ),
      );
    else report.live = { status: "NOT_REQUESTED", newLiveJobs: 0 };
    report.javascriptErrors = errors.count;
    requireCheck(errors.count === 0, "BROWSER_JAVASCRIPT_ERROR_OBSERVED");
    report.status = report.signup.status.startsWith("PASSED")
      ? "PASSED"
      : "BLOCKED_SIGNUP";
  } catch (error) {
    report.status = "FAILED";
    report.failure = {
      phase,
      code: safeFailure(error),
      exceptionType: [
        "Error",
        "TimeoutError",
        "TargetClosedError",
        "TypeError",
        "AbortError",
      ].includes(error?.name)
        ? error.name
        : "WITHHELD",
    };
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
    if (browser) await browser.close().catch(() => {});
    report.completedAt = new Date().toISOString();
    report.wholeWorkflowMs =
      Date.parse(report.completedAt) - Date.parse(report.startedAt);
    if (output)
      await writePrivate(join(output, "receipt.json"), report).catch(() => {
        report.status = "FAILED";
        report.failure = { phase: "REPORT", code: "SAFE_REPORT_WRITE_FAILED" };
      });
  }
  console.log(JSON.stringify(report, null, 2));
  return report.status === "PASSED"
    ? 0
    : report.status === "BLOCKED_SIGNUP"
      ? 2
      : 1;
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      console.log(
        JSON.stringify({
          status: "FAILED",
          code: "HOSTED_VERIFICATION_FAILED",
        }),
      );
      process.exitCode = 1;
    });
}
