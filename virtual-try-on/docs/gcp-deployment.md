# VirtualWardrobe GCP demo deployment

Deploy the Phase 1 application into the existing `virtualtryon-511016` project using a distinct `virtualwardrobe-demo` resource prefix. The existing StyleReel application, buckets, queue, secrets and Hosting site are unrelated resources and must be preserved.

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

The apply operation creates billable resources. It creates missing resources and updates only this application's named services, IAM bindings, lifecycle policies and maintenance schedule. It does not recreate or rotate existing database/bootstrap secrets or remove other applications. Supply `--image` to deploy an already-built backend image instead of starting a new Cloud Build.

The script requires an authenticated Google Cloud CLI principal with permission to create the specified resources and their narrowly scoped IAM bindings. Firebase CLI uses Application Default Credentials; it is invoked through pinned `firebase-tools@15.34.1`. The script obtains Google access tokens in memory, never writes service-account keys, and does not place passwords in command arguments or output.

## Environment contract

The backend reads standard Spring datasource settings and the following application settings. Configuration values live in Cloud Run; secrets are bound from Secret Manager.

| Variable | Meaning |
| --- | --- |
| `APP_ENVIRONMENT` | `demo`, distinct from production |
| `APP_MODE` | `api` or `worker`; both use the same image |
| `JAVA_TOOL_OPTIONS` | `-XX:MaxRAMPercentage=70` under the explicit 1 GiB container memory limit |
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

The worker requires Cloud Run Invoker permission. Only the application's dispatch identity receives that binding. Cloud Tasks and Cloud Scheduler send OIDC tokens with the worker's canonical URL as audience. Generation messages contain IDs, not personal photos or contact details. [Authenticated task delivery](https://docs.cloud.google.com/run/docs/triggering/using-tasks).

Runtime identities receive Cloud SQL Client and bucket-scoped object access. The API can enqueue tasks and validate CAPTCHA assessments; the worker can call the image service. Database and bootstrap secret access is bound per secret. A custom IAM role grants only `iam.serviceAccounts.signBlob` on the API signing identity, allowing keyless signed URLs without a project-wide Token Creator grant. The signing identity also needs permission for the object operation. [Keyless signing requirements](https://docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers).

The private media bucket enforces uniform access and public-access prevention. Database-driven maintenance enforces the 24-hour source/unsaved retention and explicit deletions. Lifecycle rules make temporary prefixes eligible for deletion after one day as a backstop; GCS lifecycle execution is asynchronous, so the application maintenance schedule remains responsible for the stated deletion timing. Saved objects must use `saved/` and must never match temporary-prefix rules. Previously issued media URLs expire within five minutes. Cloud Storage's default seven-day soft-delete window remains a separate recovery-retention period and must be disclosed accurately.

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

The deployment writes a non-secret resource inventory to ignored `work/gcp/deployment.json`; read-only smoke results go to `work/gcp/smoke-report.json`. Keep the last known good image tag and Cloud Run revision for rollback. A Firebase Hosting release also has its own version history; frontend and backend should be rolled back together after checking database migration compatibility.

Before changing schema, verify backup configuration and create a named on-demand backup when needed. List backups and restore into a separate temporary instance for a rehearsal; validate migration compatibility and the read-only smoke before directing traffic at a restored database. Do not restore over the live database as an unattended test.

To stop an unused demo's idle database cost, pause task dispatch and scheduled maintenance, stop API traffic and then stop the named Cloud SQL instance. Storage and some other charges may continue. Full teardown requires reviewing the inventory, preserving any required backups, disabling database deletion protection intentionally, and deleting only the `virtualwardrobe` resources. Dataset cleanup is not infrastructure teardown. No automatic destructive teardown command is supplied.
