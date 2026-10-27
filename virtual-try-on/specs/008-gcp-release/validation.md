# Feature 008 verification status

Updated 2026-10-27 after all hosted operational checks and final load cleanup/preservation passed. CI correction verification and root final convergence remain pending at this checkpoint. This is an evaluation demo, not production quality approval. Results below distinguish completed checks, failed instrumentation and work still pending. No 40-pair human review or statistical generation p95 is claimed.

## Revision and completed source gates

The deployed application source is `f87c8f109516e0e3055c4016800548a1bc433241`. The dedicated customer/staff site is [Virtual Wardrobe](https://virtualwardrobe-511016.web.app). Runtime inventory, immutable image/revisions and Hosting release are retained privately in `work/gcp/deployment.json` and its release snapshots. The successful verifier ran from operator commit `c25207570b391e1496865f485fac452fce73deee`, against the unchanged deployed application commit above. Its native runtime was Node24.18.0 on macOS arm64 with an explicitly selected Chrome156.0.8078.48 executable and fresh non-persistent contexts. The operator-only instrumentation/runtime corrections changed no backend or customer UI; do not describe the deployed application as the newer verifier commit.

- Final backend: 178 tests across 19 reports, zero failures/errors/skips, 1m46s, Java21/PostgreSQL17 and 1GiB/70% heap. Final package/readiness passed. Evidence: `work/008-backend-release-final.log`, `work/008-backend-release-package.log` and [catalog lifecycle](catalog-validation.md)/[safe failures](safe-errors-validation.md).
- Final required disposable browser suite: 14/14, zero skips, 25.7s; seeded all-role workflow 22.9s. Independent resources were removed; primary data/credentials were unchanged. Evidence: `work/virtualwardrobe-e2e-20261027050137-cc34f6/` and [frontend source verification](frontend-source-validation.md).
- Root verified 37 controlled operator checks: 14 deployment, 9 seed-wrapper and 14 release-tools cases, including loopback-only keepalive/measurement regressions. Hosted guards passed 18/18 after the verifier correction (15 policy/activity cases plus 3 upload-observation regressions). Build, lint, TypeScript/source/credential checks passed. These are controlled source checks, not hosted success. Root independently reran all 18 guards before the operator checkpoint.
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

The recorded completion is one real sample, not a generation p95 or human saree-fidelity result. The public job DTO does not expose usage; a separate read-only accounting snapshot confirmed one settled Google attempt with2303 input,1120 output and942 thought tokens. Its configured-rate token estimate is US$0.04412, while the conservative application ledger committed US$0.25 and retained zero outstanding reservation. The earlier standalone connectivity estimate was US$0.0403965; the two token estimates total approximately US$0.08452. These are estimates, not an invoice, and exclude CloudRun/SQL/storage/build/backup and other infrastructure costs. Evidence: `work/gcp/post-provider-accounting.json` and `provider-smoke.json`.

## Completed operational evidence

Authenticated maintenance and a controlled owned catalog upload/removal were checked on the deployed app. The terminal and raw cleanup markers were set; all four tracked new live keys were absent, the durable queue had zero remaining rows, deleted application access returned404, and all three retained original VALIDATED media rows plus their six full/thumbnail objects remained present. An original image still returned200. Evidence: `work/gcp/catalog-gc-journal.json` and `catalog-gc-observation.json`; the observation exposed no object keys. The helper's earlier case-sensitive Location lookup did not complete its new-image read and is retained in the journal rather than reported as success. Metadata, authenticated deletion, live-object absence and retained-object checks establish the cleanup result independently. Cloud Storage's seven-day soft-delete recoverability remains enabled: absence of live objects is not a claim of permanent purge from every recovery/backup layer.

Backup1793063385022 was restored only into its newly created rehearsal instance. Source and restored checks matched PostgreSQL17, schema/migration10 with zero pending migrations, the tested JAR fingerprint beginning9515, and exact core counts:14 accounts,3 stores,30 products and4 jobs. The actual temporary instance was then deleted; a follow-up found zero instances with that exact name and confirmed the source remained RUNNABLE. No restore overwrote the source. Evidence: `work/gcp/backup-rehearsal.json`, `db-check-source.json`, `db-check-restore.json` and `backup-cleanup-verification.json`.

## Actual performance and preserved limits

The independent load dataset supplied1000 published products alongside the standard30, giving1030 measured public rows. The first fresh-TLS urllib client sample returned400/400 HTTP200 but FAILED the750ms client gate with p95 approximately1019.17ms. Its exact461-request CloudRun correlation showed fast warmed server handling (aggregate server p95 approximately53.736ms, max89.8ms). That failed client observation is preserved in `work/gcp/performance-api-initial.json` and `performance-server-correlation-initial.json`; it is not replaced with the server metric or silently called a pass.

Operator-only commit `8b67c72d208ea03dca8c61e28235c4e9051fac90` changed the load transport to20 independent persistent HTTP(S) clients, three same-client warm-up reads each, a barrier, then20 measured reads per user. Endpoints,60 warm-up/400 measured requests, the750ms unrounded gate and app revision f87 remained unchanged. There are no automatic request retries or redirects; failed reads are counted and only a later scheduled read may reconnect. A first pre-measure warm-up was blocked by a platform429 and exited without a400-request measured sample or new pass report. That bounded failure is preserved in `performance-retest-premeasure-execution.json`, `performance-retest-premeasure-diagnosis.json` and `performance-retest-429-diagnosis.json`. Root then explicitly authorized a steady-warm retest; no instance/profile/threshold limit was increased to obtain its result.

The persistent-client retest PASSED:400/400 HTTP200,20 users,60 warm-up reads, aggregate median126.64ms, raw p95425.8820000104606ms and reported max579.45ms. All endpoint groups had80 samples with zero errors and unrounded p95 below750ms. Display values below are rounded, while the gate used raw values:

| Group | Client p95 ms |
| --- | ---: |
| All |425.882 |
| Browse |481.772 |
| Search |366.871 |
| Product |308.511 |
| Categories |352.772 |
| Brands |204.244 |

Evidence: `work/gcp/performance-api.json`, `performance-warm-confirmation-execution.json` and `performance-server-correlation-warm.json`. All461 expected first/warm/measured requests were correlated to the intended revision. No product-runtime optimization or generation call was made for this client correction.

Mobile browsing PASSED all five fresh390×844/DPR2 contexts with4×CPU,9Mbps down/1.6Mbps up/150ms latency, browser cache disabled and the disclosed five-read backend prewarm. First-image decoding and two animation frames preceded the raw usability gate. Raw usable times were2506.5,1896.1,1751.0,2034.8 and1778.3ms, all below3000ms, with1030 rows and zero JavaScript errors. Evidence: `work/gcp/performance-mobile.json`; this is a synthetic warmed-backend profile, not field-user or cold browsing performance.

The separate initial cold observation measured21.372seconds after a zero-instance preflight. Exact API revision and request-to-instance startup evidence matched (`work/gcp/api-scale-zero-before-performance.json`, `performance-api-initial.json`, `performance-server-correlation-initial.json`). Cold latency was excluded from warmed summaries. Scale-to-zero latency and the observed scale-out/platform429 are material MVP cost-limit tradeoffs; warm steady-state success does not establish a3-second cold visit or unlimited burst availability. The reviewed minimum/maximum instance and concurrency limits remain unchanged.

The explicit load cleanup completed with state DELETED at2026-10-27T01:49:13Z, removing its1000 products and2006 live objects. The final01:55Z database/storage verification passed all15 checks: zero load users/products/live keys;2006 owned object-manifest tombstones all DELETED with zero active entries; restored baseline14 accounts/3 stores/30 products/4 jobs; standard dataset ACTIVE with12 enabled demo users and102 preserved live objects; independent bootstrap still enabled outside the dataset; credential files0600/digests unchanged; schema10, empty deletion queue and the same one Google attempt preserved. A separate resource check confirmed unchanged f87 API/worker image/revisions, unchanged StyleReel revision and public catalog30. Evidence: `work/gcp/demo-operator-virtualwardrobe-load-v1-cleanup.json`, `final-state-verification.json` and `final-resource-verification.json`. Verification started no app/provider. The seven-day soft-delete recovery policy remains distinct from removal of live load objects. T018 is now complete.

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
| A6 refunds/billing/deletion/late writes |PASS local adversarial fault/concurrency tests plus hosted result/catalog cleanup, retained-media checks and one settled Google accounting snapshot. Seven-day storage recoverability is distinct from live-object removal. |
| A7 forty-pair human fidelity | PENDING. No human scores/approval created; production Google remains fail-closed without operator approval. |
| A8 1000 products/20 users/mobile/cold |PASS actual1030-row/20-user steady-warm API and five decoded/painted mobile measurements; separate21.372s cold evidence recorded. Initial client p95 failure and pre-measure429 preserved. Explicit load cleanup and all15 final preservation checks passed. |
| A9 generation deadline/p95 |PASS single actual deadline sample:25.316s, one attempt. Statistical generation p95 remains PENDING; one sample cannot establish it. |
| A10 responsive/accessibility | PASS local required360px-through-desktop/keyboard/automated WCAG checks; hosted390px masked views captured. No full human accessibility-conformance claim. |
| A11 idempotent seed/safe cleanup |PASS local transactional preservation, actual cloud seed-twice and final scoped load cleanup; baseline, standard objects/credentials/bootstrap and one live attempt were preserved. |
| A12 deployed smoke/integration |PASS real provider/worker/private-result/customer-store integration, security/runtime smokes, actual monitoring, maintenance and isolated restore/deletion. Final load cleanup and preservation passed; CI correction verification and delivery closure remain pending. |

## Delivery and remaining release work

The private repository was pushed to [joinarun/VirtualWardrobe](https://github.com/joinarun/VirtualWardrobe), at first pushed main revision `893414d92bc893c5389c63c7dc53be17886952dc`. The unchanged deployed app is f87, the successful native verifier is c252075 and the persistent performance operator is8b67; these are distinct provenance facts.

[First GitHub Actions run40434284728](https://github.com/joinarun/VirtualWardrobe/actions/runs/40434284728) FAILED at the E2E standalone CLI ownership boundary. Its backend178, web/hosted18 guards, operator37, lint and build checks passed; it is not recorded as a green run. The host-owned700/600 credential directory was being accessed by the container's different UID. Foundation's correction maps the bootstrap/seed wrappers to the host UID/GID and supplies the matching numeric Java user.name when that UID has no container passwd entry. Java's ownership/permission checks were not weakened. Three controlled wrapper checks passed, including the Mac Bash3.2 regression, and the exact mapped wrapper source passed a fresh required14/14 browser suite in26.3s with zero skips. Root reviewed the patch. Its clean commit/push and second actual CI result are pending; no new green CI run is claimed here. Evidence of the first failure remains in `work/gcp/github-ci-initial-failed.log`.

T016–T021 now have their required operational/documentation evidence, including owners' released cost/limits/rollback/teardown/runbook/README records. T022 remains unchecked until the corrected source is pushed and its actual CI result is verified. T023 remains root's final convergence/delivery gate. The final commit/run reference must be recorded accurately rather than assigning a newer operator/documentation revision to the deployed app. Human40-pair fidelity approval and statistically meaningful generation p95 remain explicitly pending; no approval or percentile is fabricated. The observed21.372s cold start, scale-out/platform429, infrastructure cost floor and recoverable soft-delete retention remain material delivery limits.

All hosted operational work and temporary-resource cleanup are verified. Only CI correction confirmation and final root convergence remain in feature008. This specification-document update performed no tests, API/cloud/browser/model calls or runtime changes.

## Full Linux CI ownership follow-up

The second CI run [40436578871](https://github.com/joinarun/VirtualWardrobe/actions/runs/40436578871) passed backend178, hosted18, operator37, wrapper3, lint and build. The mapped bootstrap succeeded, but the mapped seed stopped at `DEMO_OPERATION_FAILED`. A full standalone seed on an actual Linux named-volume filesystem reproduced `AccessDeniedException` at the local media root: earlier root-run tests had created the shared parent under root ownership. Mac Docker bind mapping had hidden that difference.

Bootstrap now prepares only the exact host-owned work/media directories as0700 before root containers start. Foreign ownership and symlinks are refused; contents are preserved without recursive chown or a root fallback. The same patched helper on a fresh Linux filesystem completed12accounts/30products/102objects, supported root API-equivalent media reads/writes on the same path, and repeated with `changed=false` and unchanged credentials. Existing PREPARING data also resumed with its original credentials. Evidence: `work/ci-linux-full-seed-receipt.json` and `work/ci-linux-prepared-full-seed-receipt.json`.

The final exact-source disposable browser run passed14/14 in27.0s, zero skips (`work/virtualwardrobe-e2e-20261027074944-0b4b9e/`). All7 runner/security checks pass, including Bash3.2 status/cleanup compatibility. Java, application code, cloud runtime and credential security checks are unchanged. The next actual CI run remains pending; neither failed CI run is represented as green.
