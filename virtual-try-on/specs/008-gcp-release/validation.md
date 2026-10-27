# Feature 008 verification status

Updated 2026-10-27 before the corrected hosted verifier is run. This is an evaluation demo, not production quality approval. Results below distinguish completed checks, failed instrumentation and work still pending. No 40-pair human review or statistical generation p95 is claimed.

## Revision and completed source gates

The deployed application source is `f87c8f109516e0e3055c4016800548a1bc433241`. The dedicated customer/staff site is [Virtual Wardrobe](https://virtualwardrobe-511016.web.app). Runtime inventory, immutable image/revisions and Hosting release are retained privately in `work/gcp/deployment.json` and its release snapshots. The verifier-only instrumentation correction is a separate operator-source checkpoint; it changes no backend or customer UI. Root records that checkpoint before the next authorized verification action. Do not describe the deployed runtime as a newer operator commit.

- Final backend: 178 tests across 19 reports, zero failures/errors/skips, 1m46s, Java21/PostgreSQL17 and 1GiB/70% heap. Final package/readiness passed. Evidence: `work/008-backend-release-final.log`, `work/008-backend-release-package.log` and [catalog lifecycle](catalog-validation.md)/[safe failures](safe-errors-validation.md).
- Final required disposable browser suite: 14/14, zero skips, 25.7s; seeded all-role workflow 22.9s. Independent resources were removed; primary data/credentials were unchanged. Evidence: `work/virtualwardrobe-e2e-20261027050137-cc34f6/` and [frontend source verification](frontend-source-validation.md).
- Root verified 30 controlled operator checks: 14 deployment, 9 seed-wrapper and 7 release-tools cases. Hosted guards passed 17/17 after the verifier correction (14 policy cases plus 3 upload-observation regressions). Build, lint, TypeScript/source/credential checks passed. These are controlled source checks, not hosted success. Root independently reran all 17 guards before the operator checkpoint.
- V10 catalog cleanup, live/private reference protection, dataset lock ordering, late-write retries, bounded deletion draining, safe error responses/events and public240s/private no-store caching are implemented and covered by the backend suite. An already-started storage operation can outlast the two-second new-start budget; no whole-request two-second guarantee is made.

## Completed hosted evidence

Application deployment/readiness and seven non-destructive smokes passed on the deployed revision: valid public routes returned200, anonymous worker access returned403 and API internal paths returned404. Runtime configuration uses PostgreSQL17/Flyway V10, the CloudSQL connector, private storage, real CAPTCHA, keyless signed URLs, authenticated queue/maintenance and the reviewed instance/pool/time/spend limits. Root/GCP verified the separate existing application remained unchanged. Evidence: `work/gcp/deployment.json`, `deployment-readiness.json`, `smoke-report.json` and release inventory. The readiness artifact's historical NOT_SEEDED label predates the separate seed receipts below.

The independent bootstrap account completed password rotation, remains outside the demo dataset and has its protected secret updated. Standard cloud seed ran twice with unchanged counts, objects and credential digest. All twelve demo users, three stores, thirty sarees and required fixture/history minima were checked; JSON/text credentials remain0600. Evidence: `work/gcp/bootstrap-rotation.json`, `standard-seed-first.json`, `standard-seed-verification.json` and the standalone operator receipt. These commands invoked no image provider.

The first hosted runner completed real CAPTCHA signup once, secure sessions/stale-CSRF denial, owned catalog/scope checks and the customer-to-store callback conversation. Its receipt records duplicate preservation, authoritative claim winner, internal-note isolation, cross-scope denial, reassignment/closure/history. It then FAILED during the signed-upload verification step. The entire runner must therefore not be called a pass. Evidence: `work/gcp/hosted-run-console.json` and `hosted-verification-OejKCg/receipt.json`.

Monitoring passed actual ingestion and incident checks: the fixed synthetic RELEASE_PROBE appeared in logs, the application-scoped metric had one point, the scoped policy was enabled with zero notification channels, and the Console showed one OPEN incident. The original one-minute policy opened after propagation; alignment tuning is a recommendation, not a fabricated acceptance failure or a new policy change. Evidence: `work/gcp/observability.json`, `monitoring-probe.json`, `monitoring-probe-verification.json` and `monitoring-console-verification.json`.

## First upload failure and independent diagnostics

The initial full runner failed with `SIGNED_PUT_REPLAY_OR_LENGTH_CORS_FAILED` before job creation. An independent upload-only diagnostic then observed original PUT200, replay412, exact browser-generated Content-Length/origin, absent cookie/CSRF, and successful deletion of its unused source. It did not finalize a photo or invoke a provider (`work/gcp/upload-diagnostic-receipt.json`).

A route-enabled follow-up reproduced the instrumentation discrepancy: Playwright `request.allHeaders()` omitted automatic Content-Length while routing was enabled, but CDP `Network.requestWillBeSentExtraInfo` observed the exact length and origin on the actual wire with no cookie/CSRF. Original PUT was200, replay was412, no finalize was requested and the unused source was deleted (`work/gcp/upload-route-diagnostic-receipt.json`). This confirms an observability mismatch in the verifier rather than a broken signed-size or create-only contract. A separate static code review also found the unawaited asynchronous header-observation race; it is an additional correction, not an unsupported explanation replacing the controlled route diagnostic.

The minimal verifier correction binds and awaits the exact original upload's CDP wire observation, retain the genuine finalize hold, replay the same Blob/headers while raw bytes still exist, require412, then continue the original request unchanged. It preserves server-selected bucket/key, signed MIME/exact length/cache/create-only headers, no cookie/CSRF, no secret-bearing XML/HAR/logs and the durable one-paid-action journal. Do not relax backend signing, manually force a browser Content-Length or bypass CORS. Callback reruns must use the newly captured enquiry UUID in the existing detail route, avoiding an ambiguous label shared with older closed history while preserving the real POST claim.

A separate read-only database accounting check found three seeded mock jobs only, zero non-demo/non-dataset/Google jobs, zero provider-started attempts, zero accepted requests/customer use, and zero reserved/committed/observed dollars. That check created no job, changed no journal and invoked no provider (`work/gcp/pre-provider-accounting.json`). This is application-generation accounting, not a statement that hosting/storage/SQL operations have no cost. The failed paid-action reservation remains protected; root must reconcile it explicitly against this proof before any corrected bounded attempt. It must never be silently deleted to bypass the guard.

## Acceptance matrix at this checkpoint

| Criterion | Result and evidence boundary |
| --- | --- |
| A1 customer full journey | PARTIAL: actual signup/login/discovery/callback passed; real preview/save/relogin/download/delete pending. Local fixture journey passed. |
| A2 staff conversation | PASS hosted: claim, public/internal/customer replies, reassignment, close and history. |
| A3 direct scope/owner denial | PASS local adversarial tests and hosted enquiry/store samples; live result/media samples pending. |
| A4 concurrent final-admin/claim | PASS actual local PostgreSQL concurrency tests; not mislabelled as a hosted race. |
| A5 duplicates/unknown outcomes | PASS actual local job/delivery/enquiry tests and hosted callback duplicate; real queue/provider integration pending. |
| A6 refunds/billing/deletion/late writes | PASS local fault/concurrency/lifecycle tests; real provider/job lifecycle and controlled hosted catalog-maintenance proof pending. |
| A7 forty-pair human fidelity | PENDING. No human scores/approval created; production Google remains fail-closed without operator approval. |
| A8 1000 products/20 users/mobile/cold | PENDING actual hosted measurements and independent load cleanup. Local dataset preparation/cleanup already passed. |
| A9 generation deadline/p95 | PENDING actual asynchronous job. A single future sample can establish one deadline result, not statistical p95. |
| A10 responsive/accessibility | PASS local required360px-through-desktop/keyboard/automated WCAG checks; hosted390px masked views captured. No full human accessibility-conformance claim. |
| A11 idempotent seed/safe cleanup | PASS local transactional cleanup/preservation and actual cloud seed-twice checks; hosted load-dataset cleanup still pending. |
| A12 deployed smoke/integration | PARTIAL: deployment, security/runtime smokes, real signup/callback and monitoring passed; real provider/private result lifecycle, operations and restore evidence pending. |

## Remaining release work

T013–T016 need the corrected signed-upload/genuine finalize proof, one explicitly bounded asynchronous Google job, save/relogin/download/delete and owner denial, plus authenticated hosted cleanup evidence. T018 needs the independent1000-product load,20-user warm/API and declared mobile measurements, separate cold observation and scoped cleanup. T019 needs isolated backup/restore/count/schema/JAR comparison and verified removal. T020 needs the final cost/limits/rollback/teardown inventory. T021–T023 need updated delivery/runbooks/README, GitHub/CI publication tied accurately to the app/operator revisions and final convergence with all passed/failed/blocked/unrun evidence. Any temporary restore resource must be removed or listed as a blocking cleanup action. Keep human quality and statistical generation targets explicitly pending; no fabricated approval or percentile.

This file is an interim evidence checkpoint. Actual live/performance/restore receipts must replace pending statuses only after they exist. No cloud/model/browser operation was performed by the documentation review.
