# GCP release verification

This runbook records completed feature008 checks and the reusable execution sequence. The deployed site is [VirtualWardrobe](https://virtualwardrobe-511016.web.app), running backend source `f87c8f109516e0e3055c4016800548a1bc433241` with shared API/worker digest `sha256:818014f033b967bc0baeba6c9d13191dc93c64a8ba8b5c7ff8def95cd6093e39`. It is a real Google **AI EVALUATION DEMO**, using fictional stores and owned synthetic inputs. The 40-pair human fidelity review remains pending; deployment must never set `APP_GENERATION_QUALITY_REPORT` or claim production quality approval.

## Actual evidence and remaining gates

This snapshot includes the completed hosted journey, measurements, isolated restore and final cleanup verification through 2026-10-27T01:55Z. Update pending results only from their actual receipts; prepared tools are not a pass.

| Check | Status and evidence |
| --- | --- |
| Base configuration | PASS — 20 actual checks in `work/gcp/provisioning-verification.json`. |
| Build/deployment/migrations | PASS — Cloud Build succeeded, matching immutable API/worker image, schema 10 applied/validated, dedicated Hosting pinned; `deployment.json`/`deployment-readiness.json`. |
| Public/direct/private boundaries | PASS — 7 smoke checks, worker 403/public internal 404, DB readiness UP, dispatch-only worker Invoker and actual authenticated maintenance 200. |
| Runtime modes/limits | PASS — real Enterprise CAPTCHA; Google/global evaluation mode; reviewed instance/pool/concurrency/quota/budget settings in `runtime-config-verification.json`. |
| Bootstrap | PASS — actual Hosting rotation before seeding; independent non-dataset account and updated secret; safe `bootstrap-rotation.json`. |
| Standard seed/idempotence | PASS — 12 accounts, 3 stores, 30 products, 102 objects; all 8 seed checks pass with unchanged credential digest and 0600 files in `standard-seed-verification.json`. No provider call. |
| Catalog media/signing | PASS — actual public cover read via Hosting/API/keyless GCS returned 200 JPEG; `public-catalog-media-verification.json`. |
| Monitoring | PASS — single synthetic log/metric probe and actual OPEN incident `0.oeacxougqnde`, policy `3308792671088295695`, zero channels; monitoring receipt pair. |
| Hosted signup/auth/callback | PASS for completed phases — real CAPTCHA signup, secure sessions/CSRF, catalog/internal routes, callback/staff conversation/reassignment/closure/privacy. See hosted safe receipts. |
| Signed source upload/full live job | PASS — native Chrome journey `hosted-verification-HMgWoE/receipt.json`: genuine browser PUT200, pre-finalize replay412 with exact wire length/origin and no cookies/CSRF, one Google attempt, RUNNING→SUCCEEDED in25.316s server time, consent/private denial/save/relogin/download/delete and original gallery preservation. Canonical paid journal RESULT_DELETED. |
| Catalog deletion/garbage collection | Cleanup PASS at 01:18:51Z, including final late-write recheck and zero remaining queue rows — one added synthetic catalog image was validated and API-deleted, app404, four candidate new keys absent, all 3 original media and 6 original objects preserved. The helper lost case-insensitive HTTP headers before following the new public read, so that specific new-image200 is UNRUN; existing public JPEG200 remains proved. `catalog-gc-journal.json`/`catalog-gc-observation.json`. |
| 1,000-product/20-user API | Warm steady-state PASS — 1,030 published rows, 20 persistent user connections, 60 excluded warm-up reads and 400/400 measured HTTP200 responses. Unrounded client p95 425.882ms against 750ms; every endpoint passes. Initial fresh-TLS failure and later cold-burst warm-up429 are retained below. |
| Temporary load cleanup | PASS — load-v1 is DELETED with no remaining load accounts/products/live objects; all 2,006 retained ownership-manifest rows are DELETED tombstones. Final 15 checks restore baseline 14 accounts/3 stores/30 products/4 jobs, preserve 12 enabled standard users/102 live objects/bootstrap/0600 credential files, and confirm zero pending deletion/reservation work. `final-state-verification.json`. |
| Mobile/cold measurements | Mobile PASS —5 fresh Chrome 156 contexts, decoded/painted usable1.751–2.507s under the exact390/DPR2/CPU4×/9Mbps/150ms/cache-off profile. Cold separately confirmed from0-instance preflight and same-instance first request/startup:21.372s client/20.512s server. |
| Actual backup/isolated restore/removal | PASS — successful backup `1793063385022` restored only into a fresh copy. All 10 migrations/checksums and tested JAR matched, with baseline 14 accounts/3 stores/30 products/4 jobs. Copy deleted; independent lookup finds no target and source PostgreSQL17 remains RUNNABLE. `backup-rehearsal.json`/`backup-cleanup-verification.json`. |
| Human quality/statistical generation performance | PENDING — A7 human 40-pair review and meaningful A9 p95 are not established by connectivity or one synthetic smoke. |
| Final source/CI delivery | PASS — private [GitHub source](https://github.com/joinarun/VirtualWardrobe), tested code `9c6649f2cf586cfde7a5788721ad7e2eaf2c1e2f` and [passing CI](https://github.com/joinarun/VirtualWardrobe/actions/runs/40438095853). Earlier two setup failures are retained in release validation. Final Markdown records this result; runtime app stays `f87c8f1`. |

The earlier failed upload verification made no Google call: aggregate source `pre-provider-accounting.json` has zero non-demo/non-dataset/Google jobs, zero provider_started_at attempts, zero generation-day rows/accepted/reserved/committed/observed totals and zero customer quota use. No active or unfinalized non-dataset sources were counted at that snapshot. This is scoped to this application's database and is not a claim about other applications in the cloud project. The later authorized live journey submitted exactly one real job: `post-provider-accounting.json` records one Google CONFIRMED settled attempt, no active Google jobs, zero reserved USD,2303 input/1120 candidate-output/942 thought tokens. The application estimates USD0.04412 from configured rates (USD1.50/30.00/7.50 per million respectively) and commits the conservative USD0.25 reservation. These figures are application accounting, not actual Cloud Billing charges; the three seeded mock jobs remain separate. The separately authorized earlier connectivity-only request in `provider-smoke.json` has an estimated USD0.0403965 cost, with no retry. Combined token-rate estimates are about USD0.08452; they exclude infrastructure and other project applications and are not a billing export.

“Removed objects” in these checks means no live GCS object remains. The configured seven-day soft-delete recovery window is separate; this is not a claim of immediate irreversible purging.

Final resource verification also passed: Hosting returned HTTP200 with exactly 30 products; API and worker retain the recorded ready revisions and shared immutable image; unrelated StyleReel remains `stylereel-00013-6xr`. No infrastructure or runtime limit changed during performance testing. `final-resource-verification.json` records these control-plane checks without credentials. The load dataset ID remains tombstoned; future load tests must use a reviewed new version rather than trying to reseed v1.

## Publish the reviewed source

Finish features 001–007, run required backend/browser checks, and commit all tracked and non-ignored source changes. The publishing script rejects a dirty tree and records HEAD. Keep the explicit project argument; the operator's default gcloud project is unrelated.

```bash
python3 scripts/gcp/deploy.py --project virtualtryon-511016
python3 -m unittest discover -s scripts/gcp -p test_deploy.py -v
```

After the release source is authorized for execution:

```bash
python3 scripts/gcp/deploy.py --project virtualtryon-511016 --apply
python3 scripts/gcp/smoke.py
python3 scripts/gcp/observability.py --project virtualtryon-511016 --apply
```

The last command creates a log-based failure counter and a Console incident policy for only the two new app services. It adds no recipients or notification channels and preserves other applications' policies. Verify a safe failure event and actual metric/incident ingestion before marking monitoring complete. Safe application events use a stable code and `vw_failure=true`; aggregate counts and random job IDs are acceptable, while photos, contact details, credentials, signed URLs and raw provider/SQL exceptions are not. JSON log format and stack-trace exclusion cannot sanitize arbitrary message text by themselves. The backend's error boundaries must enforce the event policy. [Boot structured logging](https://docs.spring.io/spring-boot/reference/features/logging.html), [Cloud Logging JSON fields](https://docs.cloud.google.com/logging/docs/structured-logging).

The operator probe uses authenticated Cloud Logging Entries.Write through existing user ADC, with a fixed synthetic RELEASE_PROBE event attached to the actual inventory image/API revision. It adds no application endpoint or runtime fault flag. Default invocation is a plan; --probe explicitly writes one journaled event for that revision, and --verify reads log/metric/policy evidence. A timeout remains UNKNOWN_OUTCOME and prevents blind resubmission.

```bash
python3 scripts/gcp/monitoring-probe.py --project virtualtryon-511016
python3 scripts/gcp/monitoring-probe.py --project virtualtryon-511016 --probe
python3 scripts/gcp/monitoring-probe.py --project virtualtryon-511016 --verify
```

Ingestion can be delayed; rerun read-only verification after normal propagation, not the write. The tool deliberately leaves incident status as REQUIRES_CONSOLE_INSPECTION. Inspect the actual scoped policy/incident in Cloud Monitoring and record its state/time separately; passing log/metric checks alone cannot prove an incident opened. Mark this probe synthetic rather than claiming it was a real application fault.

Actual Console inspection completed: [incident 0.oeacxougqnde](https://console.cloud.google.com/monitoring/alerting/alerts/0.oeacxougqnde?project=virtualtryon-511016) was OPEN at 2026-10-26T23:58:24Z, following the one synthetic probe at 23:54:21 UTC. No second event or policy edit was needed. The deployed 60-second alignment passed this exercise after propagation. [Google's log-metric guidance](https://docs.cloud.google.com/logging/docs/logs-based-metrics/troubleshooting) recommends allowing for ingestion delays up to 10 minutes; record longer-window tuning as a future improvement, without changing policy/source during the active hosted run or relabelling this passed test as failed.

## Private seed execution

Before loading a dataset, root signs in to the independent bootstrap super admin through the real application and completes mandatory temporary-password rotation. Obtain the bootstrap secret in process memory and retain the rotated credential only in an ignored local file with mode 0600/appropriate Secret Manager entry; do not print it or place it in argv. Verify business access after rotation. This account must remain outside the dataset and survive cleanup.

Feature007's standalone CLI and [cloud wrapper](gcp-demo-data.md) are implemented. Use the installed host Java21 explicitly, rather than the host's other Java versions. The existing `postgres-socket-factory:1.30.2` supports direct keyless Cloud SQL connectivity through ADC; no proxy or database IP allowlist is needed. The read-only preparation found a valid user ADC file, successful refresh and no installed Cloud SQL proxy.

The wrapper sets the explicit Cloud SQL connector URL and `GOOGLE_CLOUD_QUOTA_PROJECT=virtualtryon-511016`; it captures the database password from Secret Manager into the child environment, never argv or printed shell substitution. Owned source images are read locally and written to private GCS through the same ADC. No Cloud Run Job, Spring context, web listener, background worker/provider or uploaded key starts.

```bash
python3 scripts/gcp/cloud-demo.py seed --project virtualtryon-511016 --dataset virtualwardrobe-demo-v1 --run
python3 scripts/gcp/cloud-demo.py seed --project virtualtryon-511016 --dataset virtualwardrobe-demo-v1 --run
python3 scripts/gcp/cloud-demo.py status --project virtualtryon-511016 --dataset virtualwardrobe-demo-v1 --run
```

Compare unchanged counts/credentials on the second seed. Status and cleanup dry-run never run migrations or create schema/files/objects. Deleted dataset IDs are tombstoned; a later seed requires an explicit new owned version such as v2.

Write requested demo credentials only to an ignored local file with mode 0600. Reports contain counts and dataset IDs, never passwords, phone numbers or recovery codes. Cleanup must use the specific seeded dataset ownership and preserve the bootstrap account, unrelated records and all StyleReel resources. The separate 1,000-row performance dataset must have independent targeted cleanup.

## Hosted acceptance journeys

Use the actual dedicated Hosting URL and its `/api` rewrite for browser checks, including real CAPTCHA signup, login, `__session`/CSRF continuity, first-login rotation and workforce store boundaries. Test the direct API URL as well. An API/internal request must404; a public request to the worker must be rejected by Cloud Run IAM. A successful real job must establish actual task OIDC, Google JWT verification, canonical audience, sequence validation and the Java SQL connector, rather than inferring them from unit tests.

Use the hosted runner's plan first, then its --run auth/callback/security mode and separate --allow-one-live-job authorization. A durable journal must precede the one new paid UI action so interrupted retries cannot silently generate another job. Make one ordinary real CAPTCHA signup attempt; a risk/challenge refusal is blocked evidence without retries, test bypass or score reduction.

With a seeded synthetic customer and an owned synthetic person/garment pair, execute exactly one authorized live asynchronous job. Record provider/model, queue→running→terminal states, elapsed time, attempts and observed estimated usage. Verify explicit consent, signed source PUT with the returned headers and automatic browser Content-Length. Hold the real finalize request after PUT completes, replay the same Blob/headers while the raw object exists and require412, then continue that original request unchanged. A replay after finalization has deleted raw bytes is not the same test. Continue polling, result display, save, return after login, download and delete. Test a second customer's private denial and the absence of a source-photo read route. Keep tokens, cookies, signed URLs and customer contacts out of screenshots/reports; record no HAR and mask contacts in390px/DPR2 views. Verify catalog media public302 cache240s versus signed URL300s; private responses remain no-store.

Create an enquiry from an actual product/preview and verify store notification, atomic first-open assignment, reassignment/status history and store scoping. Test retries/duplicates and dataset cleanup. Record operational success separately from garment-fidelity quality; a synthetic smoke is not the human benchmark.

## Actual performance evidence

The real hosted job completed before operational load. Successful backup1793063385022 was durably recorded before the independent load-v1 dataset was seeded:1000 published products/2006 objects, no try-on jobs. Initial/mobile operator source `64b4c4054237b933309626234d78d8f26dd7f5fa` and warm-client operator `8b67c72d208ea03dca8c61e28235c4e9051fac90` measured deployed app `f87c8f1`; operator commits did not redeploy the app.

The first API run completed all400 measured requests without errors, but its end-to-end p95 was1019.17ms and therefore failed the750ms target. Per-endpoint p95: browse1112.61, search1173.55, product876.76, categories878.78 and brands823.19ms. The complete461-request Cloud Run sample (first observation +60 warm-up +400 measured) gives warmed server p9553.736ms/max89.781ms; this distinguishes server response time from workstation/network/TLS cost and does not relabel the failed client sample as passed. The urllib client opened a new TLS connection on every request. Its exact report, execution receipt and cold/server correlation are retained as `performance-*-initial.json`, with hashes in the warm execution receipts.

A reviewed transport correction then gave each of 20 users one persistent HTTP/1.1 client, with three same-client warm-up reads each and a barrier before 20 measured reads per user. It changed no target, sample count, concurrency, runtime limit or database tier, and performs no automatic request retries or redirects. One explicitly authorized attempt stopped before measurement because Cloud Run returned a platform “no available instance”429 during cold/scale-out warm-up; its execution and safe log receipts remain separate. No measured sample from that attempt is claimed.

The subsequent explicitly authorized steady-state confirmation passed: 400/400 HTTP200 responses in 3.40s, median126.64ms and unrounded p95 425.882ms. Endpoint p95 values were browse481.77, search366.87, product308.51, categories352.77 and brands204.24ms. The complete 461-record server sample gives measured server p95 167.576ms and max256.419ms. Read-only correlation allowed a five-second envelope for small client/server clock differences, and retained no raw URLs or instance IDs. Reports: `performance-api.json`, `performance-warm-confirmation-execution.json`, `performance-server-correlation-warm.json`. The cold-burst429 and observed cold latency remain explicit limitations; this warm pass does not imply immediate cold readiness.

All five fresh native Chrome156.0.8078.48 mobile contexts passed with decoded/painted usable times2506.5,1896.1,1751.0,2034.8 and1778.3ms, zero JavaScript errors and1030 catalog rows. Search timings were419–602ms. These are synthetic profile observations, not field-user percentiles.

The quiet API window ended after the last request at01:08:41Z and a0-instance metric at01:25:52Z. The first request at01:26:19Z took21372ms client time and20512ms server time. A matching new-instance startup at01:26:20Z belongs to that request's exact revision and instance, so this is a confirmed cold-start observation. It is excluded from warmed metrics. `performance-server-correlation.json` retains only timestamps/aggregates/match booleans, not raw URLs or instance IDs. Do not wake the API with extra catalog/health probes before the intended cold-start observation.

Prepare the separate 1,000 published catalog rows using feature 007 and record its dataset ID. Run from the declared operator location, with max instances and minimum 0 unchanged. The API tool requires 20 simultaneous users, separates 60 warm-up reads from 400 measured reads, verifies the live catalog count and enforces per-endpoint and aggregate p95 ≤750 ms. It excludes image and AI transfer. Its first observation is separate; only real startup-system-log evidence supports a cold-start statement. Use a quiet API window after scale-to-zero for that observation, and retain matching startup timestamps. A request observed without startup evidence must not be labelled cold.

```bash
python3 scripts/gcp/cloud-demo.py seed --project virtualtryon-511016 --dataset virtualwardrobe-load-v1 --run
python3 scripts/gcp/performance.py
python3 scripts/gcp/performance.py --run --client-location 'Operator workstation, India' --read-startup-logs
node scripts/gcp/performance-mobile.mjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/gcp/performance-mobile.mjs --run
python3 scripts/gcp/cloud-demo.py cleanup --project virtualtryon-511016 --dataset virtualwardrobe-load-v1 --run
python3 scripts/gcp/cloud-demo.py cleanup --project virtualtryon-511016 --dataset virtualwardrobe-load-v1 --run --execute-cleanup
```

Mobile verification uses five fresh 390×844 Chromium contexts, 4× CPU slowdown, 9 Mbps down/1.6 Mbps up, 150 ms latency and disabled browser cache. It warms the backend with five ordinary reads first. “Usable” means search is enabled and a title, price and first product image render after immediate scrolling to the collection. Each run must meet ≤3 seconds. The report also records search response time and JavaScript failures. This is a synthetic laboratory profile, not field-user telemetry. Preserve `performance-api.json`, `performance-mobile.json` and the anonymous catalog screenshot under ignored `work/gcp`.

Investigate failed measurements through query counts, indexes, response size, image dimensions and actual database/runtime limits. Do not silently increase minimum instances to disguise cold starts or exceed the reviewed cost bounds. Remove only the dedicated performance dataset afterward.

Load cleanup completed at 01:49:13Z, followed by read-only convergence at 01:55:00Z. Core counts match the saved baseline; the standard dataset is ACTIVE with 12 enabled users, 3 stores, 30 products and 102 live objects. The independent bootstrap remains enabled outside the dataset and all standard/bootstrap credential files remain0600. The load dataset has no account/product/live object or active object-manifest entry; 2,006 deleted ownership rows remain as audit tombstones. The application still has exactly one real Google attempt, no active Google job or provider reservation, all 10 migrations and an empty deletion queue.

## Backup, migration and restore rehearsal

This phase completed successfully after the live journey. Successful backup `1793063385022` was fixed before load mutations and restored only into `virtualwardrobe-restore-20261027-010934-d69044`. At 01:34:19Z the copy matched the saved 14-account/3-store/30-product/4-job baseline, tested JAR SHA and all 10 valid migrations, with zero pending. The copy was then deleted; independent verification at 01:39:08Z found zero matching instances and the source database RUNNABLE. The live database was never overwritten.

The tested JAR SHA256 is `9515f903970463c35c44bc3d52e64d2f8ba5e6449664386f044b584a4af6cbfd`. Source backup retention remains billable and separate from deleting the temporary copy.

After the final seeded application is quiescent, package the final tested backend JAR and use the explicit host Java21 path. The check helper loads only its JDBC/Flyway dependencies and migration resources; it does not start the application, worker or provider. It takes the password in a child environment and prints only schema versions and aggregate counts.

```bash
python3 scripts/gcp/db-check.py --project virtualtryon-511016
python3 scripts/gcp/db-check.py --project virtualtryon-511016 --run
python3 scripts/gcp/backup-rehearsal.py --project virtualtryon-511016
python3 scripts/gcp/backup-rehearsal.py --project virtualtryon-511016 --run
```

The rehearsal creates one named on-demand backup and a fresh random `virtualwardrobe-restore-*` PostgreSQL17 instance. It restores only into that new copy, validates migration checksums, runs the same migrations there, compares core row counts and deletes the copy in a `finally` block. It never restores over the live demo database. The on-demand release backup is retained for rollback; review its retention separately. The temporary db-f1-micro, 10 GB SSD and retained backup incur normal charges.

Keep `db-check-source.json`, `db-check-restore.json` and `backup-rehearsal.json`. A failed or interrupted cleanup remains a release action: use the exact recorded temporary-instance name, check its operations and deletion protection, and remove only that rehearsal copy. The next rehearsal refuses to create another copy while previous cleanup is pending. Do not mark backup recovery tested until the actual restore comparison and deletion succeed.

## Efficient remaining run order

After the hosted journey/live job is complete, use this order if root authorizes both operational phases:

1. Quiesce account/catalog/job mutations, fix the final tested JAR path and start the backup rehearsal. It captures aggregate baseline and creates a named successful backup before provisioning its empty restore instance.
2. Wait until `backup-rehearsal.json` records that backup ID and pending restore-instance creation. The baseline and backup are then fixed. Independent load seeding/performance/targeted cleanup may overlap the slow temporary-instance provisioning, because restore comparison uses the saved baseline rather than later live counts. Do not overlap mutations before the backup is confirmed.
3. Seed only `virtualwardrobe-load-v1` (or a reviewed unused version), which uses direct JDBC/GCS and does not wake the API. Let the actual API scale-to-zero state determine whether the first performance request is a cold observation; use matching startup logs, not elapsed quiet time alone. Run warmed API measurements, then warmed-backend/fresh-browser mobile measurements, and remove only the load dataset after its dry run.
4. Let the rehearsal restore/check/finally-delete finish. Verify equal migration/core counts/JAR fingerprint and actual temporary deletion. Resolve an unknown/pending create or cleanup before another rehearsal; retain the source backup for rollback.
5. Preserve safe reports, verify standard/bootstrap/runtime records and unrelated StyleReel, then update the final acceptance matrix. If cold-start evidence or another criterion is absent, record it as unrun/blocked rather than inventing a result or raising minimum instances silently.

No phase above is authorized merely by being documented. The operator must retain the project's explicit execution gates, exact resource names, credential protection and bounded provider rules.
