# Feature 008 verification status

Updated 2026-10-27 after the corrected hosted verifier completed one actual Google journey. This is an evaluation demo, not production quality approval. Results below distinguish completed checks, failed instrumentation and work still pending. No 40-pair human review or statistical generation p95 is claimed.

## Revision and completed source gates

The deployed application source is `f87c8f109516e0e3055c4016800548a1bc433241`. The dedicated customer/staff site is [Virtual Wardrobe](https://virtualwardrobe-511016.web.app). Runtime inventory, immutable image/revisions and Hosting release are retained privately in `work/gcp/deployment.json` and its release snapshots. The successful verifier ran from operator commit `c25207570b391e1496865f485fac452fce73deee`, against the unchanged deployed application commit above. Its native runtime was Node24.18.0 on macOS arm64 with an explicitly selected Chrome156.0.8078.48 executable and fresh non-persistent contexts. The operator-only instrumentation/runtime corrections changed no backend or customer UI; do not describe the deployed application as the newer verifier commit.

- Final backend: 178 tests across 19 reports, zero failures/errors/skips, 1m46s, Java21/PostgreSQL17 and 1GiB/70% heap. Final package/readiness passed. Evidence: `work/008-backend-release-final.log`, `work/008-backend-release-package.log` and [catalog lifecycle](catalog-validation.md)/[safe failures](safe-errors-validation.md).
- Final required disposable browser suite: 14/14, zero skips, 25.7s; seeded all-role workflow 22.9s. Independent resources were removed; primary data/credentials were unchanged. Evidence: `work/virtualwardrobe-e2e-20261027050137-cc34f6/` and [frontend source verification](frontend-source-validation.md).
- Root verified 30 controlled operator checks: 14 deployment, 9 seed-wrapper and 7 release-tools cases. Hosted guards passed 18/18 after the verifier correction (15 policy/activity cases plus 3 upload-observation regressions). Build, lint, TypeScript/source/credential checks passed. These are controlled source checks, not hosted success. Root independently reran all 18 guards before the operator checkpoint.
- V10 catalog cleanup, live/private reference protection, dataset lock ordering, late-write retries, bounded deletion draining, safe error responses/events and public240s/private no-store caching are implemented and covered by the backend suite. An already-started storage operation can outlast the two-second new-start budget; no whole-request two-second guarantee is made.

## Completed hosted evidence

Application deployment/readiness and seven non-destructive smokes passed on the deployed revision: valid public routes returned200, anonymous worker access returned403 and API internal paths returned404. Runtime configuration uses PostgreSQL17/Flyway V10, the CloudSQL connector, private storage, real CAPTCHA, keyless signed URLs, authenticated queue/maintenance and the reviewed instance/pool/time/spend limits. Root/GCP verified the separate existing application remained unchanged. Evidence: `work/gcp/deployment.json`, `deployment-readiness.json`, `smoke-report.json` and release inventory. The readiness artifact's historical NOT_SEEDED label predates the separate seed receipts below.

The independent bootstrap account completed password rotation, remains outside the demo dataset and has its protected secret updated. Standard cloud seed ran twice with unchanged counts, objects and credential digest. All twelve demo users, three stores, thirty sarees and required fixture/history minima were checked; JSON/text credentials remain0600. Evidence: `work/gcp/bootstrap-rotation.json`, `standard-seed-first.json`, `standard-seed-verification.json` and the standalone operator receipt. These commands invoked no image provider.

The first hosted runner completed real CAPTCHA signup once, secure sessions/stale-CSRF denial, owned catalog/scope checks and the customer-to-store callback conversation. Its receipt records duplicate preservation, authoritative claim winner, internal-note isolation, cross-scope denial, reassignment/closure/history. It then FAILED during the signed-upload verification step. The entire runner must therefore not be called a pass. Evidence: `work/gcp/hosted-run-console.json` and `hosted-verification-OejKCg/receipt.json`.

## Successful actual hosted journey

The corrected native-browser run PASSED all five requested stages with zero JavaScript errors. Evidence: `work/gcp/hosted-verification-HMgWoE/receipt.json`, completed at2026-10-27T01:05:15.339Z. It reused the earlier successful real CAPTCHA signup proof and recorded `PASSED_PREVIOUS`/`attemptedNow=false`; it did not make another signup attempt. Session/stale-CSRF, catalog/source scope and the complete callback/staff-history journey passed again. The already-closed earlier enquiry remained history; the rerun addressed its newly captured enquiry UUID and retained the actual POST claim/winner proof.

The customer gave the real evaluation-mode consents, uploaded the owned synthetic person image through the actual signed capability, replayed before allowing the genuine finalize request to proceed, created one persistent job, and completed the Google lifecycle. The wire observation matched exact expected length/origin with no cookie or CSRF header. Original PUT was200; replay was412. High-level Playwright headers still omitted automatic length, while the awaited CDP wire proof was true, as the diagnostics predicted. No backend signing relaxation or mocked cloud response was used.

| Measurement / result | Actual observed value |
| --- | --- |
| Provider / model | Google / gemini-nano-banana-2.1, evaluation demo |
| New job / attempts | One new job, one provider attempt |
| Server job creation to completion |25.316seconds, within180seconds |
| Poll-to-terminal observation |24.095seconds |
| Reserved UI action to terminal |52.171seconds, including upload/replay/setup |
| Entire verification workflow |160.540seconds, including authentication, callback and result lifecycle |
| Save/relogin/download/delete |PASS; original fixture gallery preserved |
| Source read / other customer / workforce result access |404 denial proved |
| JavaScript errors / human quality approval |0 / false |

The recorded completion is one real sample, not a generation p95 or human saree-fidelity result. Provider usage is not exposed by the public job DTO; no charge or cost-per-accepted-image value is invented from timing. Operational accounting/cost inventory remains separate evidence.

## Diagnostic boundaries and preserved failures

Monitoring passed actual ingestion and incident checks: the fixed synthetic RELEASE_PROBE appeared in logs, the application-scoped metric had one point, the scoped policy was enabled with zero notification channels, and the Console showed one OPEN incident. The original one-minute policy opened after propagation; alignment tuning is a recommendation, not a fabricated acceptance failure or a new policy change. Evidence: `work/gcp/observability.json`, `monitoring-probe.json`, `monitoring-probe-verification.json` and `monitoring-console-verification.json`.

## First upload failure and independent diagnostics

The initial full runner failed with `SIGNED_PUT_REPLAY_OR_LENGTH_CORS_FAILED` before job creation. An independent upload-only diagnostic then observed original PUT200, replay412, exact browser-generated Content-Length/origin, absent cookie/CSRF, and successful deletion of its unused source. It did not finalize a photo or invoke a provider (`work/gcp/upload-diagnostic-receipt.json`).

A route-enabled follow-up reproduced the instrumentation discrepancy: Playwright `request.allHeaders()` omitted automatic Content-Length while routing was enabled, but CDP `Network.requestWillBeSentExtraInfo` observed the exact length and origin on the actual wire with no cookie/CSRF. Original PUT was200, replay was412, no finalize was requested and the unused source was deleted (`work/gcp/upload-route-diagnostic-receipt.json`). This confirms an observability mismatch in the verifier rather than a broken signed-size or create-only contract. A separate static code review also found the unawaited asynchronous header-observation race; it is an additional correction, not an unsupported explanation replacing the controlled route diagnostic.

The implemented verifier correction binds and awaits the exact original upload's CDP wire observation, retains the genuine finalize hold, replays the same Blob/headers while raw bytes still exist, requires412, then continues the original request unchanged. It preserves server-selected bucket/key, signed MIME/exact length/cache/create-only headers, no cookie/CSRF, no secret-bearing XML/HAR/logs and the durable one-paid-action journal. Do not relax backend signing, manually force a browser Content-Length or bypass CORS. Callback reruns now use the newly captured enquiry UUID in the existing detail route, avoiding an ambiguous label shared with older closed history while preserving the real POST claim.

A separate read-only database accounting check found three seeded mock jobs only, zero non-demo/non-dataset/Google jobs, zero provider-started attempts, zero accepted requests/customer use, and zero reserved/committed/observed dollars. That check created no job, changed no journal and invoked no provider (`work/gcp/pre-provider-accounting.json`). This is application-generation accounting, not a statement that hosting/storage/SQL operations have no cost. This was the pre-provider checkpoint used by root to reconcile the failed reservation explicitly before the later one-job authorization. Its zero-spend snapshot does not describe the database after the successful real job. Paid-action history remains protected; it must never be silently removed to bypass the guard.

Earlier25-second login/view and live-setup waits are retained as failed observations, not silently relabelled. Read-only Cloud Run/SQL diagnostics found fast sampled auth-handler responses (the observed200-response groups had p95 values below443ms), with the intended deployed revision/digest ready. Focused browser samples proved cookie rotation, matching authenticated session and `/account` navigation; an extended pre-click sample reached the real consent/file controls without submitting a job. Evidence: `work/gcp/auth-latency-sql-diagnosis.json`, `login-cloud-diagnosis.json`, `postlogin-diagnostic-receipt.json` and `tryon-preclick-extended-receipt.json`. These samples do not establish a universal latency cause or replace the declared load/mobile measurements. No auth/session business-app fix was made. The separately identified unversioned AuthProvider stale-load write remains a source review finding, not a demonstrated cause of the hosted waits.

## Acceptance matrix at this checkpoint

| Criterion | Result and evidence boundary |
| --- | --- |
| A1 customer full journey |PASS hosted: earlier real signup plus actual login/discovery/Google preview/save/relogin/view/download/delete/callback. The final run reused signup proof without another attempt. |
| A2 staff conversation | PASS hosted: claim, public/internal/customer replies, reassignment, close and history. |
| A3 direct scope/owner denial |PASS local adversarial tests and hosted enquiry/store/source/live-result samples, including other-customer and workforce404 denial. |
| A4 concurrent final-admin/claim | PASS actual local PostgreSQL concurrency tests; not mislabelled as a hosted race. |
| A5 duplicates/unknown outcomes |PASS local adversarial duplicate/unknown-outcome tests, hosted callback duplicate and one actual queued Google job with one attempt. No uncontrolled live failure/retry was manufactured. |
| A6 refunds/billing/deletion/late writes |PASS local fault/concurrency/lifecycle tests and successful hosted result deletion/privacy lifecycle; controlled hosted catalog-maintenance and final accounting evidence remain pending. |
| A7 forty-pair human fidelity | PENDING. No human scores/approval created; production Google remains fail-closed without operator approval. |
| A8 1000 products/20 users/mobile/cold | PENDING actual hosted measurements and independent load cleanup. Local dataset preparation/cleanup already passed. |
| A9 generation deadline/p95 |PASS single actual deadline sample:25.316s, one attempt. Statistical generation p95 remains PENDING; one sample cannot establish it. |
| A10 responsive/accessibility | PASS local required360px-through-desktop/keyboard/automated WCAG checks; hosted390px masked views captured. No full human accessibility-conformance claim. |
| A11 idempotent seed/safe cleanup | PASS local transactional cleanup/preservation and actual cloud seed-twice checks; hosted load-dataset cleanup still pending. |
| A12 deployed smoke/integration |PASS real provider/worker/private-result/customer-store integration plus deployed security/runtime smokes and monitoring; operational cleanup/restore/performance evidence remains pending before final release closure. |

## Remaining release work

T013–T015 are now proven by the successful real hosted receipt. T016 still needs authenticated hosted cleanup evidence; local PostgreSQL retry/reference/delayed-write evidence remains its separate prerequisite. T018 needs the independent1000-product load,20-user warm/API and declared mobile measurements, separate cold observation and scoped cleanup. T019 needs isolated backup/restore/count/schema/JAR comparison and verified removal. T020 needs the final cost/limits/rollback/teardown inventory. T021–T023 need updated delivery/runbooks/README, GitHub/CI publication tied accurately to the app/operator revisions and final convergence with all passed/failed/blocked/unrun evidence. Any temporary restore resource must be removed or listed as a blocking cleanup action. Keep human quality and statistical generation targets explicitly pending; no fabricated approval or percentile.

This file is an interim evidence checkpoint. Actual operational/performance/restore receipts must replace pending statuses only after they exist. No cloud/model/browser operation was performed by the documentation review.
