import test from "node:test";
import assert from "node:assert/strict";
import { allowedMutation, plan, main, signOut } from "./mobile-verify.mjs";

test("mobile verification defaults to a credential-free offline plan", async () => {
  const original = console.log;
  let printed;
  console.log = (value) => { printed = JSON.parse(value); };
  try { assert.equal(await main([], { DEBUG: "*" }), 0); }
  finally { console.log = original; }
  assert.equal(printed.network, false);
  assert.equal(printed.credentialRead, false);
  assert.equal(printed.newLiveJobs, 0);
  assert.deepEqual(plan().themes, ["pearl", "sage", "midnight", "system"]);
});
test("mobile verification denies generation, upload and product mutations", () => {
  for (const path of ["/api/v1/me/try-on/jobs", "/api/v1/me/try-on/uploads", "/api/v1/staff/products"])
    for (const method of ["POST", "PUT", "PATCH", "DELETE"])
      assert.equal(allowedMutation(path, method), false);
  assert.equal(allowedMutation("/api/v1/auth/login", "POST"), true);
  assert.equal(allowedMutation("/api/v1/auth/logout", "POST"), true);
  assert.equal(allowedMutation("/api/v1/auth/login/extra", "POST"), false);
});
test("logout verification waits for the genuine completed POST, not the click", async () => {
  let release, predicate, clicked = false, finished = false, landed = false, resolved = false;
  const response = { url: () => "https://virtualwardrobe-511016.web.app/api/v1/auth/logout",
    request: () => ({ method: () => "POST" }), status: () => 204,
    finished: async () => { finished = true; } };
  const page = {
    waitForResponse: (check) => { predicate = check; return new Promise((done) => { release = done; }); },
    getByRole: () => ({ click: async () => { clicked = true; } }),
    waitForURL: async (check) => { assert.equal(finished, true); assert.equal(check(new URL("https://virtualwardrobe-511016.web.app/")), true); landed = true; },
  };
  const pending = signOut(page).then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(clicked, true);
  assert.equal(resolved, false);
  assert.equal(predicate({ ...response, request: () => ({ method: () => "GET" }) }), false);
  assert.equal(predicate({ ...response, status: () => 403 }), false);
  assert.equal(predicate(response), true);
  release(response);
  await pending;
  assert.equal(finished, true);
  assert.equal(landed, true);
  assert.equal(resolved, true);
});
