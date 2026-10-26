# GCP release verification

This runbook prepares feature 008. Cloud base provisioning passed 20 configuration checks in `work/gcp/provisioning-verification.json`. Application hosting, live generation, measured performance and restored-database verification require their own actual runs. The hosted target is a real Google **AI EVALUATION DEMO**, using fictional stores and owned synthetic inputs. The 40-pair human fidelity review remains pending, and deployment must never set `APP_GENERATION_QUALITY_REPORT` or claim production quality approval.

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

## Private seed execution

Before loading a dataset, root signs in to the independent bootstrap super admin through the real application and completes mandatory temporary-password rotation. Obtain the bootstrap secret in process memory and retain the rotated credential only in an ignored0600 local file/appropriate Secret Manager entry; do not print it or place it in argv. Verify business access after rotation. This account must remain outside the dataset and survive cleanup.

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

Prepare the separate 1,000 published catalog rows using feature 007 and record its dataset ID. Run from the declared operator location, with max instances and minimum 0 unchanged. The API tool requires 20 simultaneous users, separates 60 warm-up reads from 400 measured reads, verifies the live catalog count and enforces per-endpoint and aggregate p95 ≤750 ms. It excludes image and AI transfer. Its first observation is separate; only real startup-system-log evidence supports a cold-start statement. Use a quiet API window after scale-to-zero for that observation, and retain matching startup timestamps. A request observed without startup evidence must not be labelled cold.

```bash
python3 scripts/gcp/cloud-demo.py seed --project virtualtryon-511016 --dataset virtualwardrobe-load-v1 --run
python3 scripts/gcp/performance.py
python3 scripts/gcp/performance.py --run --client-location 'Operator workstation, India' --read-startup-logs
node scripts/gcp/performance-mobile.mjs
node scripts/gcp/performance-mobile.mjs --run
python3 scripts/gcp/cloud-demo.py cleanup --project virtualtryon-511016 --dataset virtualwardrobe-load-v1 --run
python3 scripts/gcp/cloud-demo.py cleanup --project virtualtryon-511016 --dataset virtualwardrobe-load-v1 --run --execute-cleanup
```

Mobile verification uses five fresh 390×844 Chromium contexts, 4× CPU slowdown, 9 Mbps down/1.6 Mbps up, 150 ms latency and disabled browser cache. It warms the backend with five ordinary reads first. “Usable” means search is enabled and a title, price and first product image render after immediate scrolling to the collection. Each run must meet ≤3 seconds. The report also records search response time and JavaScript failures. This is a synthetic laboratory profile, not field-user telemetry. Preserve `performance-api.json`, `performance-mobile.json` and the anonymous catalog screenshot under ignored `work/gcp`.

Investigate failed measurements through query counts, indexes, response size, image dimensions and actual database/runtime limits. Do not silently increase minimum instances to disguise cold starts or exceed the reviewed cost bounds. Remove only the dedicated performance dataset afterward.

## Backup, migration and restore rehearsal

After the final seeded application is quiescent, package the final tested backend JAR and use the explicit host Java21 path. The check helper loads only its JDBC/Flyway dependencies and migration resources; it does not start the application, worker or provider. It takes the password in a child environment and prints only schema versions and aggregate counts.

```bash
python3 scripts/gcp/db-check.py --project virtualtryon-511016
python3 scripts/gcp/db-check.py --project virtualtryon-511016 --run
python3 scripts/gcp/backup-rehearsal.py --project virtualtryon-511016
python3 scripts/gcp/backup-rehearsal.py --project virtualtryon-511016 --run
```

The rehearsal creates one named on-demand backup and a fresh random `virtualwardrobe-restore-*` PostgreSQL17 instance. It restores only into that new copy, validates migration checksums, runs the same migrations there, compares core row counts and deletes the copy in a `finally` block. It never restores over the live demo database. The on-demand release backup is retained for rollback; review its retention separately. The temporary db-f1-micro, 10 GB SSD and retained backup incur normal charges.

Keep `db-check-source.json`, `db-check-restore.json` and `backup-rehearsal.json`. A failed or interrupted cleanup remains a release action: use the exact recorded temporary-instance name, check its operations and deletion protection, and remove only that rehearsal copy. The next rehearsal refuses to create another copy while previous cleanup is pending. Do not mark backup recovery tested until the actual restore comparison and deletion succeed.
