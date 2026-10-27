import test from "node:test";
import assert from "node:assert/strict";
import { bindOriginalPut } from "./put-observation.mjs";
const url =
  "https://storage.googleapis.com/owned-bucket/private/TEST_ONLY?signature=NOT_REAL";
const origin = "https://example.test";
const headers = { "Content-Length": "1234", Origin: origin };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const request = (id, target = url) => ({
  requestId: id,
  request: { method: "PUT", url: target },
});

test("delayed original headers bind once; faster replay events cannot substitute for them", async () => {
  const observer = bindOriginalPut({
    capabilityReady: Promise.resolve({ uploadUrl: url }),
    expectedBytes: 1234,
    origin,
  });
  let finishOriginalHeaders,
    replayHeaderReads = 0,
    settled = false;
  observer.onPlaywrightRequest({
    method: () => "PUT",
    url: () => url,
    allHeaders: () =>
      new Promise((resolve) => {
        finishOriginalHeaders = resolve;
      }),
  });
  observer.onNetworkRequest(request("original"));
  await tick();
  observer.onPlaywrightRequest({
    method: () => "PUT",
    url: () => url,
    allHeaders: async () => {
      replayHeaderReads++;
      return { Cookie: "TEST_ONLY" };
    },
  });
  observer.onNetworkRequest(request("replay"));
  observer.onNetworkExtraInfo({
    requestId: "replay",
    headers: { "Content-Length": "9999", Cookie: "TEST_ONLY" },
  });
  observer.onNetworkResponse({
    requestId: "replay",
    response: { status: 412 },
  });
  observer.onNetworkResponse({
    requestId: "original",
    response: { status: 200 },
  });
  const waiting = observer.wait(1000).then((value) => {
    settled = true;
    return value;
  });
  await tick();
  assert.equal(settled, false);
  // Fetch interception can omit this automatic header from Playwright's view.
  finishOriginalHeaders({ Origin: origin });
  await tick();
  observer.onNetworkExtraInfo({ requestId: "original", headers });
  const result = await waiting;
  assert.equal(result.originalStatus, 200);
  assert.equal(result.lengthPresent, true);
  assert.equal(result.lengthMatch, true);
  assert.equal(result.originMatch, true);
  assert.equal(result.cookieAbsent, true);
  assert.equal(result.csrfAbsent, true);
  assert.equal(result.highLevelHeadersObserved, true);
  assert.equal(result.highLevelLengthPresent, false);
  assert.equal(replayHeaderReads, 0);
  assert.ok(
    !JSON.stringify(result).includes("signature") &&
      !JSON.stringify(result).includes("TEST_ONLY"),
  );
  observer.dispose();
});
test("wire extra-info before request/capability selection is safely correlated", async () => {
  let resolveCapability;
  const observer = bindOriginalPut({
    capabilityReady: new Promise((resolve) => {
      resolveCapability = resolve;
    }),
    expectedBytes: 1234,
    origin,
  });
  observer.onNetworkExtraInfo({
    requestId: "unrelated",
    headers: { Cookie: "TEST_ONLY" },
  });
  observer.onNetworkRequest(
    request("unrelated", "https://other.test/unrelated"),
  );
  observer.onNetworkExtraInfo({ requestId: "original", headers });
  observer.onNetworkResponse({
    requestId: "original",
    response: { status: 200 },
  });
  observer.onNetworkRequest(request("original"));
  resolveCapability({ uploadUrl: url });
  const result = await observer.wait(1000);
  assert.equal(result.lengthMatch, true);
  assert.equal(result.originalStatus, 200);
  observer.dispose();
});
test("replay-only or missing original wire headers cannot satisfy the bounded proof", async () => {
  const observer = bindOriginalPut({
    capabilityReady: Promise.resolve({ uploadUrl: url }),
    expectedBytes: 1234,
    origin,
  });
  observer.onNetworkRequest(request("original"));
  await tick();
  observer.onNetworkResponse({
    requestId: "original",
    response: { status: 200 },
  });
  observer.onNetworkExtraInfo({ requestId: "replay", headers });
  await assert.rejects(
    observer.wait(15),
    (error) => error.code === "ORIGINAL_PUT_OBSERVATION_TIMEOUT",
  );
  observer.dispose();
});
