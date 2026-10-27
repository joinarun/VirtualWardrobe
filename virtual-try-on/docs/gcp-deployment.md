# VirtualWardrobe GCP demo deployment

Deploy the Phase 1 application into the existing `virtualtryon-511016` project using a distinct `virtualwardrobe-demo` resource prefix. The existing StyleReel application, buckets, queue, secrets and Hosting site are unrelated resources and must be preserved.

## Actual deployment and verification

Application hosting was deployed successfully on 2026-10-26 at 23:50:45 UTC. The running backend source is `f87c8f109516e0e3055c4016800548a1bc433241`; later documentation/operator-test commits do not change that recorded image provenance.

| Item | Observed value |
| --- | --- |
| Customer/staff website | [VirtualWardrobe demo](https://virtualwardrobe-511016.web.app) |
| Direct API | [API health](https://virtualwardrobe-demo-api-ynpzfmjw7q-el.a.run.app/api/v1/health) |
| Private worker origin | `https://virtualwardrobe-demo-worker-ynpzfmjw7q-el.a.run.app` — public requests return 403 |
| API ready revision | `virtualwardrobe-demo-api-00001-dnc` |
| Worker ready revision | `virtualwardrobe-demo-worker-00002-nj9` |
| Shared immutable backend image | `asia-south1-docker.pkg.dev/virtualtryon-511016/virtualwardrobe/backend@sha256:818014f033b967bc0baeba6c9d13191dc93c64a8ba8b5c7ff8def95cd6093e39` |
| Build/tag | Cloud Build `c58fb04f-373c-4792-995d-fee6ff2ff62f`, successful in 88 seconds; backend tag `f87c8f109516` |
| Hosting version | `sites/virtualwardrobe-511016/versions/e1c1099c2e389554`, pinned to the API revision |
| Database schema | First worker applied all 10 migrations; current API/worker validated version 10 and database readiness is UP |

Actual baseline provisioning passed 20 configuration checks. All 7 deployed smoke checks pass: website/rewrite/direct health 200, worker public 403, and public API internal root/worker/job routes 404. Worker IAM grants Invoker only to `virtualwardrobe-demo-dispatch@virtualtryon-511016.iam.gserviceaccount.com`; once-per-minute Scheduler uses that identity/canonical audience and actual maintenance returned 200. The first maintenance delivery during rollout returned 403; later unchanged configuration succeeded. Existing StyleReel remained at `stylereel-00013-6xr`; its default Hosting site was not deployed.

Runtime configuration is real reCAPTCHA Enterprise and Google `gemini-nano-banana-2.1` at `global`, labelled **AI EVALUATION DEMO**. Observed quotas are 5/customer/day, 100 globally/day, USD5/day reserved provider spending, USD0.25 per attempt and 100 saved previews. API max 2/concurrency 20/pool 5 and worker max 1/concurrency 2/pool 3 remain minimum 0, 1 CPU/1 GiB/70% heap. SQL remains zonal PG17 f1-micro, 10 GB SSD with a 20 GB growth limit, three backups and deletion protection. Private buckets, restricted upload CORS, scoped Secret Manager/keyless signing and the INR2,500 project alerts-only budget are configured as described below.

The independent bootstrap super admin completed actual Hosting sign-in/password rotation before seeding; its secret version was updated and credentials retained only in an ignored local file with mode 0600. Standard dataset `virtualwardrobe-demo-v1` is ACTIVE: 12 accounts (3 per role), 3 stores, 30 products, 11 memberships, 6 enquiries/33 events, 3 saved mock previews and 102 owned objects. Two actual seed runs plus status passed 8 checks: identical counts/objects/credential digest, second `changed=false`, minimums and 0600 credential files. Public catalog media was actually read through Hosting→API→keyless GCS URL as 200 JPEG. Seed made no provider call and bootstrap remains outside the dataset.

The scoped failure metric/policy are configured without notification channels. A single labelled synthetic `RELEASE_PROBE` reached Logging and Monitoring; Console showed OPEN incident `0.oeacxougqnde` at 2026-10-26T23:58:24Z for policy `3308792671088295695`. This proves monitoring plumbing, not a manufactured real application failure. The deployed 60-second alignment triggered after propagation; [Google recommends a longer window for delayed log metrics](https://docs.cloud.google.com/monitoring/alerts/using-alerting-ui), which remains future tuning rather than a failed test.

Hosted signup with real CAPTCHA, sessions/CSRF, catalog/internal-route checks and the customer/staff callback/history/privacy flow passed. Live upload verification then stopped at a combined replay/length/CORS guard before genuine finalize continued; a route-enabled diagnostic is pending. A private READ ONLY database snapshot at 2026-10-27T00:14:16Z confirmed only 3 seeded mock jobs/attempts, zero Google/non-demo jobs or provider starts, and zero generation reservations/committed/observed spend. The paid-action journal was not silently reset. Actual full AI generation/save/relogin/download/delete, load/performance/cold-start, backup/restore/removal and final source delivery remain pending until separately executed and recorded. No 40-pair human approval or statistical generation p95 is claimed.

Protected local receipts live under ignored `work/gcp`: deployment/readiness/runtime config/smoke, standard-seed-verification, monitoring probe/Console verification, bootstrap-rotation and pre-provider-accounting. Generated passwords, recovery codes, signed URLs and private inputs are excluded from these public docs. See [the verification runbook](gcp-release-verification.md) for the remaining phases.

## Deployment commands

From the nested application directory, inspect the reviewed non-secret configuration and resource plan:

```bash
python3 scripts/gcp/deploy.py --project virtualtryon-511016
```

The default command prints a plan and creates no cloud resources. After application tests pass and the configuration is reviewed, apply it:

```bash
python3 scripts/gcp/deploy.py --project virtualtryon-511016 --apply
python3 scripts/gcp/smoke.py
```

The apply operation creates billable resources. It creates missing resources and updates only this application's named services, IAM bindings, lifecycle policies and maintenance schedule. It does not recreate or rotate existing database/bootstrap secrets or remove other applications. `--image` may reuse only the exact backend tag for the current clean HEAD's first12 characters; an older arbitrary tag/digest is refused before cloud lookup or mutation. This keeps the rebuilt website, backend and recorded source revision consistent. Rollback uses the retained previous release rather than disguising an older image as a newer source revision.

Application publishing requires a clean Git tree, including non-ignored untracked files. Commit the reviewed source first; a generated image uses that HEAD's tag and records the full revision. Cloud Build explicitly targets `linux/amd64` and the Dockerfile's `runtime` stage. Its source upload excludes local build output, `.env` files, keys and ignored work through `infra/backend.gcloudignore`. The supported pinned base-image manifests include AMD64. Cloud Run's HTTP startup probe checks `/actuator/health/readiness`, including the database, before accepting the revision.

The script requires an authenticated Google Cloud CLI principal with permission to create the specified resources and their narrowly scoped IAM bindings. Firebase CLI uses Application Default Credentials; it is invoked through pinned `firebase-tools@15.34.1`. The script obtains Google access tokens in memory, never writes service-account keys, and does not place passwords in command arguments or output.

## Environment contract

The backend reads standard Spring datasource settings and the following application settings. Configuration values live in Cloud Run; secrets are bound from Secret Manager.

| Variable | Meaning |
| --- | --- |
| `APP_ENVIRONMENT` | `demo`, distinct from production |
| `APP_MODE` | `api` or `worker`; both use the same image |
| `JAVA_TOOL_OPTIONS` | `-XX:MaxRAMPercentage=70` under the explicit 1 GiB container memory limit |
| `LOGGING_STRUCTURED_FORMAT_CONSOLE` | Boot-supported `logstash` JSON; `level` is renamed to Cloud Logging's `severity` |
| `LOGGING_STRUCTURED_JSON_EXCLUDE` | `stack_trace`; safe application events must also omit raw exceptions, request bodies, contact data, credentials and signed URLs |
| `APP_ADAPTER_MODE` | `gcp`, enabling cloud storage and queue adapters |
| `APP_IMAGE_PROVIDER` | `google` for this explicitly labelled hosted evaluation demo; local development remains `mock` |
| `GOOGLE_CLOUD_PROJECT` and `APP_GCP_PROJECT` | Explicit project ID |
| `APP_STORAGE_BUCKET` | Private customer/catalog media bucket |
| `APP_STORAGE_SIGNER_SERVICE_ACCOUNT` | API service account used by SDK keyless signed URLs |
| `APP_TASKS_LOCATION`, `APP_TASKS_QUEUE` | Queue location and name |
| `APP_TASKS_SERVICE_ACCOUNT` | OIDC identity used on task delivery |
| `APP_WORKER_URL` | Canonical private Cloud Run worker URL and token audience |
| `APP_AI_PROJECT`, `APP_AI_MODEL`, `APP_AI_LOCATION` | Existing image-provider project/model/location settings, independent of the app region |
| `APP_AI_TIMEOUT_SECONDS` | Provider request deadline, initially 120 seconds |
| `APP_CAPTCHA_MODE` | `google`; local test CAPTCHA must be unavailable in deployed environments |
| `APP_RECAPTCHA_SITE_KEY` | Public browser key, also checked by the backend |
| `APP_RECAPTCHA_EXPECTED_ACTION` | `signup` |
| `APP_RECAPTCHA_ALLOWED_HOSTNAMES` | The two dedicated Firebase Hosting domains |
| `APP_RECAPTCHA_MIN_SCORE` | Initial server-validated score threshold `0.5` |
| `APP_GENERATION_CUSTOMER_DAILY_LIMIT` | Initially `5` |
| `APP_GENERATION_GLOBAL_DAILY_LIMIT` | Initially `100` |
| `APP_GENERATION_DAILY_BUDGET_USD` | Initially `5.00` |
| `APP_GENERATION_ENABLED` | Explicit operator kill switch, initially `true` for the evaluation demo |
| `APP_GENERATION_ATTEMPT_RESERVATION_USD` | Conservative `0.25` reservation for the reviewed model/input/output limits |
| `APP_GENERATION_SAVED_LIMIT` | Initially `100` saved previews per customer |
| `SPRING_DATASOURCE_URL` | Cloud SQL Java connector JDBC URL, with lazy refresh |
| `SPRING_DATASOURCE_USERNAME` | Database application user |
| `SPRING_DATASOURCE_PASSWORD` | Secret Manager binding; never committed |
| `SESSION_COOKIE_SECURE` | `true` for HTTPS deployment |
| `APP_BOOTSTRAP_SUPERADMIN_EMAIL` | Demo bootstrap workforce account |
| `APP_BOOTSTRAP_SUPERADMIN_PASSWORD` | One-time bootstrap secret bound only to the API |

The API listens on Cloud Run's `PORT=8080`. Health is `/api/v1/health`; the worker receives generation work at `/internal/jobs/{id}/run` and scheduled cleanup/reconciliation at `/internal/maintenance`. Backend implementation and deployment configuration must be reconciled before applying the plan; an unused environment variable does not implement the corresponding feature.

Cloud SQL connectivity uses `com.google.cloud.sql.postgres.SocketFactory` and a supported `postgres-socket-factory` dependency in the backend. No public authorized database networks are added. The Java connector supplies encrypted authenticated connectivity through the runtime service identity. [Google connection guidance](https://docs.cloud.google.com/sql/docs/postgres/connect-run).

## Security boundaries

Firebase Hosting serves the React files and rewrites `/api/**` to the public API service. Its requests preserve only the specially named `__session` cookie. The backend uses that cookie with Secure/HttpOnly/SameSite settings and an API-delivered session-backed CSRF token. Private/authentication responses must carry `Cache-Control: no-store`. Firebase Hosting is not the authorization boundary: direct API URL requests receive the same Spring authentication, authorization, CSRF and rate limits. [Firebase cookies](https://firebase.google.com/docs/hosting/manage-cache#using_cookies), [Cloud Run rewrites](https://firebase.google.com/docs/hosting/cloud-run).

The dedicated site's API rewrite uses `pinTag`, keeping its static release and backend revision associated during Hosting rollback. The script paginates the project's site list and configures only `virtualwardrobe-511016`; the existing default site is preserved. Pinned Firebase CLI15.34.1 successfully listed this project with the existing user ADC in the read-only preparation check; no separate Firebase login or key file was needed.

The worker requires Cloud Run Invoker permission. Only the application's dispatch identity receives that binding. Cloud Tasks and Cloud Scheduler send OIDC tokens with the worker's canonical URL as audience. Generation messages contain IDs, not personal photos or contact details. [Authenticated task delivery](https://docs.cloud.google.com/run/docs/triggering/using-tasks).

Runtime identities receive Cloud SQL Client and bucket-scoped object access. Both the API and worker can enqueue tasks and act as the single dispatch identity, allowing worker maintenance to reconcile committed jobs whose initial dispatch failed. The API validates CAPTCHA assessments; the worker can call the image service. Database and bootstrap secret access is bound per secret. A custom IAM role grants only `iam.serviceAccounts.signBlob` on the API signing identity, allowing keyless signed URLs without a project-wide Token Creator grant. The signing identity also needs permission for the object operation. [Keyless signing requirements](https://docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers).

The private media bucket enforces uniform access and public-access prevention. Database-driven maintenance enforces the 24-hour source/unsaved retention and explicit deletions. Lifecycle rules make temporary prefixes eligible for deletion after one day as a backstop; GCS lifecycle execution is asynchronous, so the application maintenance schedule remains responsible for the stated deletion timing. Saved objects must use `saved/` and must never match temporary-prefix rules. Previously issued media URLs expire within five minutes. Cloud Storage's default seven-day soft-delete window remains a separate recovery-retention period and must be disclosed accurately.

Cloud Storage object calls explicitly use an SDK retry budget of 30 seconds, at most two attempts, RPC limits of 20 seconds and HTTP connect/read timeouts of 5/10 seconds. A checked-generation read uses metadata and download calls; a save then writes its own unique pending key. Retry budgets stay below the five-minute save recovery lease. Application state and unique keys still prevent a late operation from replacing or attaching a newer result; SDK timeouts alone are not a correctness boundary. [Java retry configuration](https://docs.cloud.google.com/storage/docs/retry-strategy).

Bucket CORS allows GET/HEAD/PUT only from the two dedicated Hosting origins. Signed uploads bind the exact expected length, Content-Type and private/no-store cache policy for at most five minutes. They also sign and return `x-goog-if-generation-match: 0`, allowing creation only while no live object exists at that key; replay over an existing object must receive HTTP412. Browser code must upload the exact Blob and supplied allowed headers; it must not manually set the forbidden `Content-Length` header, which the browser supplies from the Blob body. Finalization still validates actual bytes before publication. An unexpired URL can recreate a raw object after deletion, but upload state prevents reattachment and scheduled cleanup removes such temporary orphans. Temporary lifecycle prefixes include `quarantine/` and `temp/`; saved output prefixes are excluded. [GCS generation preconditions](https://docs.cloud.google.com/storage/docs/request-preconditions).

## Cost and scaling

The cloud base can be prepared separately with `python3 scripts/gcp/deploy.py --project virtualtryon-511016 --apply --provision-only`. This creates billable infrastructure, identities, storage, the task queue and signup configuration, but does not build or publish application code. Without `--apply`, the script remains read-only. The ignored `work/gcp/provisioning.json` records this intermediate state; a successful provisioning step is not a successful application deployment.

The reviewed demo configuration uses PostgreSQL 17 Enterprise `db-f1-micro`, matching the local test database, with 10 GB SSD (automatic growth capped at 20 GB), zonal deployment and three automated backups. PostgreSQL 17 is supported by Cloud SQL. [Supported database versions](https://docs.cloud.google.com/sql/docs/postgres/db-versions). This is a small demo database without the shared-core SLA; move to an appropriately sized database before a production traffic commitment. Cloud SQL bills while idle. Its regional price, storage, backup and IP charges must be checked against current pricing rather than treating Cloud Run scale-to-zero as a zero-cost application. [Cloud SQL pricing](https://cloud.google.com/sql/pricing), [shared-core machine series](https://docs.cloud.google.com/sql/docs/postgres/machine-series-overview).

The API scales from zero to at most two instances with a pool limit of five connections each. The worker scales from zero to one instance, two concurrent requests and three database connections. Both have explicit 1 GiB memory limits and `-XX:MaxRAMPercentage=70`, leaving approximately 30% for native memory, thread stacks, direct buffers, the JVM and non-heap libraries. Image processing still needs its own two-slot concurrency bound and dimension validation before allocation; a larger heap does not replace those controls. Queue dispatch is capped at one request/second and two concurrent tasks. These constraints keep a small database usable and bound accidental load. Cold starts are expected. Application generation quotas and the US$5 daily provider budget remain separate from billing alerts.

Deployment also attempts to create one new **INR 2500 per calendar month alerts-only budget**, filtered to the entire `virtualtryon-511016` project. This explicitly chosen native-currency threshold is not a US$25 conversion guarantee and does not cap spending. It includes existing StyleReel charges because label coverage is not uniform enough to isolate every VirtualWardrobe charge. Alerts use only the billing account's existing default IAM recipients; no additional recipients, notification channels, Pub/Sub topics or manual messages are added. Thresholds are 50%, 90% and 100% of actual gross spend and 100% of forecast spend. Existing budgets are never edited. [Budget scopes and default notifications](https://docs.cloud.google.com/billing/docs/how-to/budgets).

The script verifies the billing currency before creation and does not perform currency conversion. If the Budget API or budget permissions are unavailable, it writes the specific reason and remaining setup command to ignored `work/gcp/budget-result.json` and continues other deployment work. That unresolved alert item must be included in delivery evidence. Application request/spend quotas remain necessary because alert calculations are delayed and an alerts-only budget does not stop usage. [Budget API behavior](https://docs.cloud.google.com/billing/docs/how-to/budget-api-overview).

Local development defaults to the clearly labelled fixture adapter. The reviewed hosted configuration explicitly uses real Google generation in an **evaluation demo** with fictional stores and owned synthetic fixtures. Customer screens must prominently identify the evaluation mode and label live output as an AI approximation. Customer/global quotas and the US$5 daily application spending gate must be active before enabling generation. A completed asynchronous synthetic-input job will establish hosted integration; it will not establish garment fidelity.

The 40-pair human saree-fidelity gate remains pending. No production-quality approval is set by deployment, and this demo is not production promotion. The backend must refuse a production Google configuration without the separately defined operator approval; a demo banner must never silently enable that approval. Nano Banana 2.1's documented model ID is `gemini-nano-banana-2.1` and its supported location is `global`; the India application/storage region does not make inference India-resident. [Google model card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/nano-banana-2-1).

## Operations

The deployment writes a non-secret resource inventory to ignored `work/gcp/deployment.json`; read-only smoke results go to `work/gcp/smoke-report.json`. Before deployment changes, it retains an owned resource snapshot under `work/gcp/releases/before-*.json`; after deployment, `deployed-*.json` retains full source SHA, latest-ready API/worker revisions, resolved immutable image digests, traffic and the dedicated live Hosting release/version. Only allowlisted fields are retained, excluding runtime environment values and Hosting release-user identities. Both deployed services must resolve to the same image digest. The first deployment has no previous app revision; that is not permission to use StyleReel as a rollback target.

Use [the release verification runbook](gcp-release-verification.md) for the actual private-media/job journey, measured performance, scoped failure monitoring and an isolated backup/restore rehearsal. Prepared scripts default to plans; their existence is not acceptance evidence.

Before changing schema, verify backup configuration and create a named on-demand backup when needed. List backups and restore into a separate temporary instance for a rehearsal; validate migration compatibility and the read-only smoke before directing traffic at a restored database. Do not restore over the live database as an unattended test.

For an emergency provider stop, pause only this app's queue and disable new provider starts in its worker. This does not cancel an already running remote request or promise zero further billing:

```bash
gcloud tasks queues pause virtualwardrobe-demo-generations --location asia-south1 --project virtualtryon-511016
gcloud run services update virtualwardrobe-demo-worker --region asia-south1 --project virtualtryon-511016 --update-env-vars APP_GENERATION_ENABLED=false
```

Keep authenticated maintenance active for expiry/deletion. The worker rechecks its generation setting before provider start. Firebase `pinTag` may still route Hosting traffic to an older API revision, so an API-only environment update does not update that pinned release. Commit the reviewed disabled configuration and publish the coordinated API/worker/Hosting release before claiming the website's generation switch changed. Inspect pending jobs, inventory and the reason for the stop before re-enabling generation and resuming the named queue.

For rollback, inspect the saved previous snapshot and choose its matching Hosting version and API/worker revisions. Verify the current additive migrations remain backward compatible. In Firebase Console, select **Hosting → virtualwardrobe-511016 → release history** and roll back only to that recorded version; its pinned API association restores with the static content. Update direct API and worker traffic to the matching recorded revisions as well, replacing the two revision placeholders below:

```bash
gcloud run services update-traffic virtualwardrobe-demo-worker --region asia-south1 --project virtualtryon-511016 --to-revisions PREVIOUS_WORKER_REVISION=100
gcloud run services update-traffic virtualwardrobe-demo-api --region asia-south1 --project virtualtryon-511016 --to-revisions PREVIOUS_API_REVISION=100
python3 scripts/gcp/smoke.py
```

Record the rollback inventory and validate both Hosting/direct access, worker audience and schema compatibility. Do not run these commands with another application's revision, restore over the source database, or resume queued generation automatically. Firebase documents release/version identity in its [release-list contract](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.releases/list); Cloud Run's revision status provides the [resolved image digest](https://docs.cloud.google.com/run/docs/reference/rest/v1/namespaces.revisions#RevisionStatus).

To stop an unused demo's idle database cost, pause task dispatch and scheduled maintenance, stop API traffic and then stop the named Cloud SQL instance. Storage and some other charges may continue. Full teardown requires reviewing the inventory, preserving any required backups, disabling database deletion protection intentionally, and deleting only the `virtualwardrobe` resources. Dataset cleanup is not infrastructure teardown. No automatic destructive teardown command is supplied.
