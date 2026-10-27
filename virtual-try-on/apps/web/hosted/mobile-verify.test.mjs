import test from "node:test";
import assert from "node:assert/strict";
import { allowedMutation, plan, main } from "./mobile-verify.mjs";

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
