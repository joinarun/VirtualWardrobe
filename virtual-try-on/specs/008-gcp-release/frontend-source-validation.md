# Frontend/hosted source validation

Status: verifier preparation complete. The initial authorized hosted run passed signup/session/catalog/callback but stopped before job creation at a header-observability guard; no provider start occurred. The approved wire-observer fix is tested and awaits the separately authorized continuation.

Final release-build gate after the178-test bounded deletion-drain fix: **14/14 required browser checks passed in25.7s, zero skips**, seeded all-role journey22.9s. Evidence: `work/virtualwardrobe-e2e-20261027050137-cc34f6/verification.log` and `result.json`; no main application data/build target sharing, dedicated containers/network/database volume removed. Pinned Chromium dependency setup was rebuilt before this run; test duration excludes build/setup.

- Earlier V10 local required browser regression:14/14 passed in24.2s, zero skips; generated-credential all-role journey20.7s. Protected evidence: `work/virtualwardrobe-e2e-20261027044300-67411a/verification.log` and `result.json`. Independent database/media/source/build target; only its own containers/network/volume removed.
- Hosted runner: `apps/web/hosted/verify.mjs`, separate from local E2E setup. Default invocation observed plan-only; the local runner's Google refusal remains unchanged.
- Controlled no-network policy/observer checks:17/17 passed. They cover plan/flag behavior, exact target/region/environment/source, protected files, fixed journal location, file/directory synchronization and concurrent exclusive reservation, signed capability confinement/bindings, private paths, actor selection, actual signup200/201 recovery-code handling, terminal timing independent of later workflow, safe errors and inherited debug/trace refusal before credential/browser work.
- Build, lint and TypeScript checks passed; customer production bundle unchanged at53modules. Hosted guard checks are included in `npm test`; no dependency was added.
- Root/GCP/privacy reviews corrected the journal location/fsync, signup200 boundary, latency calculation, stale-CSRF proof and contact/select masking. No application route or customer UI behavior changed for this verification tooling.
- The initial actual hosted run on deployed f87c8f passed real CAPTCHA signup, secure session/old-CSRF403 checks, catalog240 cache/direct API internal404, and the complete customer/staff callback conversation. It then stopped at SIGNED_PUT_REPLAY_OR_LENGTH_CORS_FAILED before genuine finalization/job creation; no provider start or spend occurred, as the separate private DB accounting receipt confirms. Protected receipt/screenshots: work/gcp/hosted-verification-OejKCg/.

Runner operation/privacy/continuation instructions: `apps/web/hosted/README.md`.

## Verified upload observability correction

One authorized upload-only diagnostic without routing observed200→412 with all high-level header booleans true. A second authorized upload-only diagnostic with the same finalize routing/mobile profile observed200→412; Playwright allHeaders omitted automatic Content-Length, while CDP Network.requestWillBeSentExtraInfo proved the actual wire length/origin and cookie/CSRF absence. Both unused sources were deleted through the owner API, no finalize/jobs request occurred, and the original paid journal remained unchanged. Safe receipts: work/gcp/upload-diagnostic-receipt.json and upload-route-diagnostic-receipt.json.

The approved verifier fix binds the exact original PUT by capability URL/first transport request, awaits its wire headers and original response status before replay, persists only safe booleans/statuses before the strict guard, and retains original2xx/replay412/length/origin/privacy requirements. Three controlled regressions cover delayed original headers versus replay, out-of-order extra-info/capability arrival and bounded failure when original proof is missing. Staff navigation now uses the captured authoritative new enquiry ID after list/count proof, preserving older CLOSED cases with identical customer/product labels.

Actual new-job execution, result save/relogin/download/delete and original gallery preservation remain pending a separate root GO after clean verifier commit and explicit reservation reconciliation. The deployed application/inventory remain f87c8f; its successful CAPTCHA proof is reused without a second signup attempt. No business application bundle changed.
