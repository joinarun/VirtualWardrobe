import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, chmod, symlink, readFile, lstat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TARGET,
  SafeFailure,
  targetInventory,
  credentialBundle,
  actors,
  jsonFile,
  uploadCapability,
  safePrivatePath,
  privateDirectory,
  writePrivate,
  reserveLiveAction,
  safeFailure,
  fixedStateDirectory,
  assertSafeEnvironment,
  signupRecovery,
  terminalObservation,
} from "./policy.mjs";
import { main } from "./verify.mjs";
const validInventory = () => ({
  project_id: TARGET.project,
  environment: "demo",
  region: "asia-south1",
  web_url: TARGET.origin,
  api_url: "https://virtualwardrobe-demo-api-test.asia-south1.run.app",
  source_revision: "a".repeat(40),
  resources: { private_bucket: TARGET.bucket },
});
const safeCode = (code) => (error) =>
  error instanceof SafeFailure && error.code === code;
async function temporary(action) {
  const directory = await mkdtemp(join(tmpdir(), "vw-hosted-policy-"));
  await chmod(directory, 0o700);
  try {
    await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
function capability() {
  const signed =
    "content-type;content-length;cache-control;host;x-goog-if-generation-match";
  return {
    uploadId: "11111111-1111-4111-8111-111111111111",
    method: "PUT",
    uploadUrl: `https://storage.googleapis.com/${TARGET.bucket}/quarantine/owned.png?X-Goog-Signature=FAKE_TEST_ONLY&X-Goog-Expires=300&X-Goog-SignedHeaders=${encodeURIComponent(signed)}`,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store, max-age=0",
      "x-goog-if-generation-match": "0",
    },
  };
}
test("default and paid-option-without-run are plan-only with no fetch or credential reads", async () => {
  const oldFetch = globalThis.fetch,
    oldLog = console.log,
    output = [];
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw Error("NETWORK_MUST_NOT_RUN");
  };
  console.log = (message) => output.push(message);
  try {
    assert.equal(
      await main([
        "--allow-one-live-job",
        "--credentials",
        "/does-not-exist/SECRET_VALUE",
        "--work-directory",
        "/must-not-create",
      ]),
      0,
    );
    assert.equal(requests, 0);
    assert.equal(JSON.parse(output[0]).mode, "PLAN");
    assert.equal(JSON.parse(output[0]).newLiveJobs, 0);
    assert.ok(!output.join("").includes("SECRET_VALUE"));
  } finally {
    globalThis.fetch = oldFetch;
    console.log = oldLog;
  }
});
test("exact project, origin, source revision, bucket and noncredential API target are required", () => {
  assert.equal(targetInventory(validInventory()).project_id, TARGET.project);
  for (const patch of [
    { web_url: TARGET.origin + "/" },
    { web_url: "https://virtualwardrobe-511016.web.app.evil.test" },
    { web_url: "https://user:secret@virtualwardrobe-511016.web.app" },
    { web_url: TARGET.origin + "?token=secret" },
    { project_id: "other-project" },
    { source_revision: "not-a-commit" },
    { resources: { private_bucket: "foreign-bucket" } },
    { api_url: "http://virtualwardrobe-demo-api-test.run.app" },
    { api_url: "https://secret@virtualwardrobe-demo-api-test.run.app" },
  ])
    assert.throws(
      () => targetInventory({ ...validInventory(), ...patch }),
      safeCode("WRONG_HOSTED_TARGET"),
    );
});
test("credential reads refuse symlinks, directories and group/world access", async () =>
  temporary(async (directory) => {
    const path = join(directory, "demo-credentials-test.json");
    await writePrivate(path, { private: "TEST_ONLY" }, true);
    assert.deepEqual(await jsonFile(path, true), { private: "TEST_ONLY" });
    await chmod(path, 0o644);
    await assert.rejects(jsonFile(path, true), safeCode("UNSAFE_INPUT_FILE"));
    await chmod(path, 0o600);
    const link = join(directory, "linked.json");
    await symlink(path, link);
    await assert.rejects(jsonFile(link, true), safeCode("UNSAFE_INPUT_FILE"));
    await assert.rejects(
      jsonFile(directory, true),
      safeCode("UNSAFE_INPUT_FILE"),
    );
  }));
test("durable reservation is0600, precedes paid work and refuses every subsequent reservation", async () =>
  temporary(async (directory) => {
    const reserved = await reserveLiveAction(directory, "a".repeat(40)),
      before = await readFile(reserved.path, "utf8");
    assert.equal((await lstat(reserved.path)).mode & 0o777, 0o600);
    assert.equal(reserved.value.state, "SUBMISSION_RESERVED");
    assert.equal(reserved.value.jobId, null);
    await assert.rejects(
      reserveLiveAction(directory, "b".repeat(40)),
      safeCode("ATTEMPT_JOURNAL_ALREADY_EXISTS"),
    );
    assert.equal(await readFile(reserved.path, "utf8"), before);
    assert.ok(
      !before.includes("X-Goog") &&
        !before.includes("password") &&
        !before.includes("cookie"),
    );
  }));
test("private output directories cannot be symlinks or group/world readable", async () =>
  temporary(async (directory) => {
    const path = join(directory, "output");
    await privateDirectory(path);
    await chmod(path, 0o755);
    await assert.rejects(
      privateDirectory(path),
      safeCode("UNSAFE_OUTPUT_DIRECTORY"),
    );
    const link = join(directory, "output-link");
    await symlink(path, link);
    await assert.rejects(
      privateDirectory(link),
      safeCode("UNSAFE_OUTPUT_DIRECTORY"),
    );
  }));
test("source capability is confined to owned GCS with create-only size/type/cache signed bindings", () => {
  assert.equal(uploadCapability(capability(), 1234, "image/png").method, "PUT");
  const variants = [
    {
      ...capability(),
      uploadUrl: capability().uploadUrl.replace(
        "storage.googleapis.com",
        "evil.test",
      ),
    },
    {
      ...capability(),
      uploadUrl: capability().uploadUrl.replace(
        TARGET.bucket,
        "foreign-bucket",
      ),
    },
    {
      ...capability(),
      uploadUrl: capability().uploadUrl.replace("Expires=300", "Expires=301"),
    },
    { ...capability(), method: "GET" },
    {
      ...capability(),
      headers: { ...capability().headers, Cookie: "TEST_ONLY" },
    },
    {
      ...capability(),
      headers: { ...capability().headers, "x-goog-if-generation-match": "1" },
    },
    {
      ...capability(),
      headers: { ...capability().headers, "Cache-Control": "public" },
    },
    {
      ...capability(),
      uploadUrl: capability().uploadUrl.replace(
        "content-length",
        "unsigned-length",
      ),
    },
  ];
  for (const value of variants)
    assert.throws(
      () => uploadCapability(value, 1234, "image/png"),
      safeCode("INVALID_UPLOAD_CAPABILITY"),
    );
});
test("private image paths remain same-origin/authenticated with no query capability", () => {
  const path =
    "/api/v1/private-media/11111111-1111-4111-8111-111111111111/content";
  assert.equal(safePrivatePath(path), path);
  for (const value of [
    "https://evil.test" + path,
    "//evil.test" + path,
    path + "?token=SECRET",
    "/api/v1/media/public/content",
    TARGET.origin + path + "#secret",
  ])
    assert.throws(
      () => safePrivatePath(value),
      safeCode("INVALID_PRIVATE_PATH"),
    );
});
test("actors derive shared accepted fixture store rather than assuming store/user IDs", () => {
  const users = Array.from({ length: 12 }, (_, index) => ({
    id: String(index),
    name: "Synthetic",
    identifier: "TEST_ONLY",
    password: "TEST_ONLY_password_123",
    storeIds: [],
    kind: "WORKFORCE",
    role: "SUPER_ADMIN",
  }));
  Object.assign(users[0], { kind: "CUSTOMER", role: "CUSTOMER" });
  Object.assign(users[1], { kind: "CUSTOMER", role: "CUSTOMER" });
  Object.assign(users[2], { role: "STAFF", storeIds: ["store-a", "store-b"] });
  Object.assign(users[3], { role: "STAFF", storeIds: ["store-b"] });
  Object.assign(users[4], { role: "STAFF", storeIds: ["store-c"] });
  const result = actors(
    credentialBundle({ schemaVersion: 1, profile: "standard", users }),
  );
  assert.equal(result.store, "store-b");
  assert.equal(result.staff.id, "2");
  assert.equal(result.teammate.id, "3");
  assert.equal(result.foreign.id, "4");
});
test("raw exceptions and malformed codes cannot appear in safe errors", () => {
  assert.equal(
    safeFailure(Error("signed_url=SECRET")),
    "HOSTED_VERIFICATION_FAILED",
  );
  const error = new SafeFailure("https://SECRET");
  assert.equal(error.message, "UNEXPECTED_FAILURE");
  assert.equal(safeFailure(error), "UNEXPECTED_FAILURE");
});

test("state journal location cannot be moved by an output-directory option", () => {
  assert.equal(
    fixedStateDirectory("/reviewed/work/gcp", "/reviewed/work/gcp"),
    "/reviewed/work/gcp",
  );
  assert.throws(
    () => fixedStateDirectory("/fresh-output", "/reviewed/work/gcp"),
    safeCode("NONCANONICAL_STATE_DIRECTORY"),
  );
});
test("debug and trace environments fail before credentials, browser import or requests", async () => {
  for (const key of [
    "DEBUG",
    "DEBUG_FILE",
    "PWDEBUG",
    "NODE_DEBUG",
    "NODE_DEBUG_NATIVE",
    "NODE_OPTIONS",
    "PLAYWRIGHT_TRACE",
    "PW_TEST_DEBUG",
    "CHROME_LOG_FILE",
  ])
    assert.throws(
      () => assertSafeEnvironment({ [key]: "SECRET_TEST_VALUE" }),
      safeCode("UNSAFE_DEBUG_ENVIRONMENT"),
    );
  assertSafeEnvironment({ DEBUG: "", NODE_DEBUG: "" });
  const oldLog = console.log,
    oldDebug = process.env.DEBUG,
    oldFetch = globalThis.fetch,
    output = [];
  let calls = 0;
  console.log = (message) => output.push(message);
  process.env.DEBUG = "pw:protocol SECRET_TEST_VALUE";
  globalThis.fetch = async () => {
    calls++;
    throw Error("MUST_NOT_RUN");
  };
  try {
    assert.equal(
      await main(["--run", "--credentials", "/must-not-read/SECRET_INPUT"]),
      1,
    );
    assert.equal(calls, 0);
    assert.equal(JSON.parse(output[0]).code, "UNSAFE_DEBUG_ENVIRONMENT");
    assert.ok(
      !output.join("").includes("SECRET_TEST_VALUE") &&
        !output.join("").includes("SECRET_INPUT"),
    );
  } finally {
    console.log = oldLog;
    globalThis.fetch = oldFetch;
    if (oldDebug === undefined) delete process.env.DEBUG;
    else process.env.DEBUG = oldDebug;
  }
});
test("concurrent reservations share a single durable paid-action journal", async () =>
  temporary(async (directory) => {
    const outcomes = await Promise.allSettled([
      reserveLiveAction(directory, "a".repeat(40)),
      reserveLiveAction(directory, "a".repeat(40)),
    ]);
    assert.equal(
      outcomes.filter((item) => item.status === "fulfilled").length,
      1,
    );
    assert.equal(
      outcomes.filter(
        (item) =>
          item.status === "rejected" &&
          safeCode("ATTEMPT_JOURNAL_ALREADY_EXISTS")(item.reason),
      ).length,
      1,
    );
    assert.equal(
      JSON.parse(
        await readFile(join(directory, "hosted-live-job.json"), "utf8"),
      ).state,
      "SUBMISSION_RESERVED",
    );
  }));

test("actual signup200 and201 both preserve one-time recovery codes; rejected signup has none", () => {
  const payload = {
    user: { kind: "CUSTOMER", phone: "TEST_PHONE" },
    recoveryCodes: ["TEST_RECOVERY"],
  };
  assert.deepEqual(signupRecovery(200, payload, "TEST_PHONE"), [
    "TEST_RECOVERY",
  ]);
  assert.deepEqual(signupRecovery(201, payload, "TEST_PHONE"), [
    "TEST_RECOVERY",
  ]);
  assert.equal(signupRecovery(403, {}, "TEST_PHONE"), null);
  assert.throws(
    () => signupRecovery(200, { user: payload.user }, "TEST_PHONE"),
    safeCode("SIGNUP_IDENTITY_OR_RECOVERY_NOT_CONFIRMED"),
  );
});
test("terminal latency uses server job completion, independently of later gallery workflow", () => {
  const observation = terminalObservation(
    {
      state: "SUCCEEDED",
      createdAt: "2026-10-27T00:00:00Z",
      updatedAt: "2026-10-27T00:00:10Z",
      attempts: 1,
    },
    { createdAt: "2026-10-26T23:59:50Z" },
    new Set(["QUEUED", "RUNNING", "SUCCEEDED"]),
    Date.parse("2026-10-27T00:00:05Z"),
    Date.parse("2026-10-27T00:00:15Z"),
  );
  assert.equal(observation.serverJobCompletionMs, 10000);
  assert.equal(observation.pollToTerminalMs, 10000);
  assert.equal(observation.actionReservationToTerminalMs, 25000);
  assert.equal(observation.terminalObservedAt, "2026-10-27T00:00:15.000Z");
  assert.equal(
    terminalObservation(
      { state: "RUNNING", createdAt: "SECRET", updatedAt: "SECRET" },
      { createdAt: new Date().toISOString() },
      new Set(),
      Date.now(),
    ).serverJobCompletionMs,
    null,
  );
  assert.ok(!JSON.stringify(observation).includes("lifecycleWorkflowMs"));
});
