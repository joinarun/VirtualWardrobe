# Develop the virtual try on app with Spec Kit

This guide describes the original eight-feature build workflow using **Codex** and **Spec Kit 1.2.3**, verified on 26 October 2026. The implemented application is now in [`virtual-try-on`](virtual-try-on/); use its [README](virtual-try-on/README.md) for runnable commands and its [feature specifications](virtual-try-on/specs/) for acceptance evidence.

The existing workspace was initialized with the operator's installed Spec Kit `1.2.4.dev0`. Keep that workspace and its constitution when continuing development. The installation and initialization commands below are a reusable playbook for starting a fresh project; do not initialize over the implemented application. This repository keeps product documents in the parent `docs/` directory and application specifications in `virtual-try-on/specs/`.

Keep the PRD about product behavior and put technical decisions in the plan. Complete and verify one feature before starting the next. A single command to build the entire marketplace makes defects in permissions, AI behavior and privacy harder to isolate.

## 1 Understand where commands run

| Command | Where it runs |
| --- | --- |
| `specify init`, `git`, `make`, `gcloud` | Your terminal |
| `$speckit-constitution`, `$speckit-specify`, etc. | A message in Codex chat, opened in the project |
| `make dev`, `make demo-seed`, deployment scripts | Your terminal, only after the relevant feature creates them |

The current Codex integration installs skills under `.agents/skills/speckit-<command>/SKILL.md` and uses the `$speckit-...` spelling. Older examples using `--ai codex`, `/speckit.specify` or a `CODEX_HOME` override do not describe this integration. [Codex integration](https://github.github.io/spec-kit/integrations/codex.html).

## 2 Install prerequisites

The shell examples use macOS/Linux. Have Git, GNU-compatible Make and a running Docker engine with Docker Compose. On macOS, Docker Desktop is one option; follow its [installation instructions](https://docs.docker.com/desktop/setup/install/mac-install/). The application development containers will provide Java and Node, so host Java/Maven are optional.

Install uv if needed. These are the official standalone installer commands; skip a command when its tool is already installed:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

Open a new terminal so the installed tools are on PATH. uv's installer is documented by [Astral](https://docs.astral.sh/uv/getting-started/installation/); Codex installation and sign-in are documented in the [official Codex CLI guide](https://learn.chatgpt.com/docs/codex/cli).

Install Python for Spec Kit and install the pinned CLI:

```bash
uv python install 3.12
uv tool install --python 3.12 specify-cli==1.2.3
uv tool update-shell
```

If the CLI is not found, reopen the terminal after `update-shell`. Then verify prerequisites:

```bash
git --version
make --version
docker version
docker compose version
codex --version
specify version
```

`docker version` must show a running server. If Specify was already installed with a different package manager, check `command -v specify` and update that installation rather than leaving two competing executables on PATH. The pinned release is available on [PyPI](https://pypi.org/project/specify-cli/1.2.3/); supported install routes are in the [Spec Kit installation guide](https://github.github.io/spec-kit/installation.html).

## 3 Initialize the project and copy the requirements

Run this from the parent directory where you want the project created:

```bash
specify init virtual-try-on --integration codex --script sh
cd virtual-try-on
specify check
git init -b main
mkdir -p docs
```

Copy this package's `docs/PRD.md` and `docs/architecture.md` into the new project's `docs/` directory. For example, change the first path to where you extracted the package:

```bash
export TRYON_KIT_DIR='/absolute/path/to/virtual-try-on-spec-kit'
cp "$TRYON_KIT_DIR/docs/PRD.md" docs/PRD.md
cp "$TRYON_KIT_DIR/docs/architecture.md" docs/architecture.md
```

Prepare ignores before any application credentials are generated:

```bash
cat >> .gitignore <<'EOF'

# Local secrets and generated artifacts
.env
.env.*
!.env.example
demo-credentials.txt
work/
node_modules/
target/
dist/
playwright-report/
test-results/
EOF
git add .
git diff --cached --stat
git commit -m "Initialize Spec Kit and product requirements"
```

Default Spec Kit initialization no longer initializes Git or creates feature branches; this guide manages Git explicitly. [Core CLI reference](https://github.github.io/spec-kit/reference/core.html).

For an existing project, preserve current work and use `specify init --here --integration codex --script sh` instead of creating a new directory. If using Codex desktop without the CLI executable, add `--ignore-agent-tools` to `specify init`, then open that folder in Codex desktop and start a fresh chat after initialization.

Start Codex in the new repository:

```bash
codex
```

Sign in if prompted. All `$speckit-...` blocks below are **Codex chat messages**, not shell commands. Send them separately and inspect each result.

## 4 Create the constitution once

Paste into Codex:

```text
$speckit-constitution Establish principles for this project using docs/PRD.md and docs/architecture.md. Build the Phase 1 web MVP with one backend serving current web and future mobile clients. Keep a modular monolith and the smallest managed infrastructure that meets the requirements. Server-side store authorization, owner-only customer media, explicit consent, bounded AI spending, durable asynchronous jobs, and auditable enquiry assignment are mandatory. Do not promise perfect garment reproduction or size/fit accuracy. Test authorization boundaries, database concurrency, recovery, job idempotency, deletion and seed cleanup. Keep mock and live image generation clearly distinct. Use only assets with documented permission. Pin supported dependencies and keep secrets and generated credentials out of Git. Each feature must have runnable acceptance evidence and preserve already working features. Do not implement payments, mobile apps, realtime chat or enterprise infrastructure in Phase 1.
```

Read the resulting constitution, normally under `.specify/memory/constitution.md`. Resolve any principle that conflicts with the PRD before continuing.

## 5 Build feature 1 with the full workflow

In another terminal at the project root, create a branch before specifying the feature:

```bash
git switch -c feat/01-foundation
```

Send each of the following messages to Codex individually.

### Specify the behavior

```text
$speckit-specify Feature 1: runnable application foundation. Read docs/PRD.md for the complete product context, but scope this feature to a developer being able to start the customer website, separate staff workspace shell, backend API and local database reproducibly. Include health checks, local mock storage/queue/image-provider adapters, environment examples and clear startup errors. The mock image provider must identify its output as a demo fixture. No real authentication, catalog CRUD, customer image generation or cloud provisioning yet. Acceptance: one documented command starts the local stack, both layouts load on mobile and desktop, API/database health is observable, and checks run without cloud credentials.
```

### Clarify ambiguity

```text
$speckit-clarify Focus on the exact feature boundary, local setup, mock versus live behavior, and acceptance evidence. Use explicit defaults in docs/PRD.md where available; ask only about unresolved decisions that change behavior.
```

Answer the questions and inspect the specification. Do not leave placeholders that later code would have to guess.

### Make the technical plan

```text
$speckit-plan Use docs/architecture.md as the technical baseline. Create apps/web with React, TypeScript and Vite; services/backend with Java 21, a currently supported Spring Boot release, Maven Wrapper, PostgreSQL and Flyway. Expose versioned REST APIs with an OpenAPI contract. Use Docker Compose for local web/backend/PostgreSQL and local adapters so no host JDK, Maven or cloud account is required. Use one backend image with API and worker modes. Pin exact supported versions and commit dependency locks. Create .env.example, Makefile, developer README, CI checks and scripts that never contain real secrets. This feature must implement make bootstrap, make dev, make down, make test, make lint, make build and make e2e. Later features will add make ai-benchmark, make bootstrap-admin, make demo-seed, make demo-clean, make smoke and make deploy-demo. Register these later targets only when their working implementation exists. Keep schema and migrations ready for later features without building the whole PRD now.
```

### Review requirements quality

```text
$speckit-checklist Check this feature for clear scope, reproducible local setup, honest mock behavior, dependency pinning and measurable acceptance criteria.
```

Review every generated checklist criterion and fix omissions in the source spec/plan. Mark an item `[x]` only after confirming that its requirement-quality criterion is satisfied, and complete this review before implementation. Unchecked items can stop implementation for review. A requirements checklist checks the writing; it is not evidence that the application works.

### Produce tasks and check consistency

```text
$speckit-tasks
```

```text
$speckit-analyze
```

Resolve material findings in the specification, plan or tasks, then rerun analysis if those artifacts change. For example:

```text
Resolve the critical and high-impact findings from the analysis by updating the affected spec, plan and tasks. Preserve this feature's scope. Explain any decision that still needs product input before implementing dependent work.
```

### Implement and converge

```text
$speckit-implement
```

```text
$speckit-converge
```

If convergence adds tasks, repeat `$speckit-implement` and `$speckit-converge` until the report is **Converged**. Then run the real checks; a model's completion statement alone is insufficient. These steps follow the [current SDD quickstart](https://github.github.io/spec-kit/quickstart.html) and [command reference](https://github.github.io/spec-kit/reference/agentic-sdd.html).

### Run and commit the feature

The following are project targets that feature 1 must create, not Spec Kit built-ins:

```bash
make bootstrap
make dev
make test
make lint
make build
make e2e
git status --short
git diff --check
git diff
git add .
git diff --cached --stat
git commit -m "Add runnable application foundation"
git switch main
git merge --ff-only feat/01-foundation
```

`make dev` should start the local stack in the background and print its URLs. Review the staged files before committing; `.env`, credentials, photos and generated test artifacts must remain ignored. Keep the dev stack running for subsequent features, or use `make down` to stop it without removing data volumes.

## 6 Build the remaining features in order

For **each** feature below, start its branch from the updated `main`, send its `specify` message, then run `clarify → plan → checklist → tasks → analyze → implement → converge` exactly as above. Use the feature-specific plan addition. Test and merge it before starting another feature. Do not send all feature specifications at once.

### Feature 2 Evaluate saree image generation

Terminal:

```bash
git switch main
git switch -c feat/02-saree-benchmark
```

Codex:

```text
$speckit-specify Feature 2: saree try-on feasibility. An evaluator can compare consented person/saree pairs with configurable image providers, record human scores for identity, garment fidelity and draping, and inspect latency, refusals and cost per accepted result. Read PRD acceptance A7 and privacy rules. Include a small smoke evaluation and a full 40-pair evaluation. Use licensed fixtures and never fabricate successful live results. Stop short of customer accounts or production job processing. This feature decides which provider/model, if any, meets the launch gate.
```

Plan addition:

```text
$speckit-plan Extend the existing backend with a small provider adapter and evaluator using Google's supported Java SDK or documented REST interface. Reuse the existing stack; do not add a Python service. Verify current Nano Banana and equivalent models, lifecycle, regions and pricing in official docs. Keep model and location configurable, credentials server-side and live generation opt-in. Add make ai-benchmark with PAIRS and MODE arguments, consent/provenance validation, bounded concurrency and a maximum estimated-spend check. Full runs require human scoring; report a failed or unmet gate honestly. Save non-personal aggregate evaluation reports under docs/evaluations; keep personal inputs/outputs under ignored work/.
```

After implementation, run a small paid smoke test only with your authorized GCP credentials and consented inputs. A mock run verifies the evaluator, not AI quality. If the real saree gate fails, revise the model, reference-photo requirements or product scope before investing in the remaining features.

### Feature 3 Accounts and store administration

Branch: `feat/03-identity-stores`

```text
$speckit-specify Feature 3: identity and stores. Implement PRD section 2 and the role table: workforce email/password accounts, customer phone/password signup with server-validated CAPTCHA, hashed single-use recovery codes, no OTP or phone-only reset, secure sessions, first-login password change, super-admin bootstrap, store profiles and store memberships. Keep workforce and customer credentials separate. Existing users accept new memberships without resetting global credentials. Super admins create stores; store admins manage only their administered memberships. Activate a store only with an active initial admin. Preserve the final active super admin and final active store admin even under concurrent changes. No customer gallery access for administrators. Add the management UI and the bootstrap-admin command.
```

Plan addition:

```text
$speckit-plan Extend the existing stack using Spring Security, password hashing, PostgreSQL-backed sessions and transactional membership rules. Follow architecture.md for Firebase-compatible __session cookies, API-delivered CSRF tokens and no-store private responses. Add real server-side reCAPTCHA verification for deployed environments and an explicit local-only test adapter that cannot be enabled in production. Add authorization and PostgreSQL concurrency tests. Bootstrap credentials are generated once or supplied securely; never put passwords in shell arguments or source control. Recovery codes must be consumed atomically and recovery attempts rate-limited.
```

### Feature 4 Catalog and product discovery

Branch: `feat/04-catalog`

```text
$speckit-specify Feature 4: implement PRD section 3 and the customer shopping interface. Store employees manage store-owned products, up to 10 validated images and one optional validated video, store brands, tags, cover/reference photos, publication and availability, and select from managed categories. Super admins manage global categories and brands. Customers and guests search, filter and browse published products from active stores. Prioritize sarees and make the mobile product page ready for try on and callback actions. Archive referenced records rather than breaking history. Enforce permissions on upload authorization, finalization, counts and every product mutation.
```

Plan addition:

```text
$speckit-plan Reuse PostgreSQL search, pagination and filters; do not add a search service. Implement signed Cloud Storage uploads with server-selected keys and validation/finalization, plus a local adapter matching that contract. Validate actual media content, sizes, pixel counts and video duration, strip metadata and create derivatives. Keep public catalog derivatives separate from private customer media. Add direct cross-store API tests and a responsive original UI with accessible product cards, filters and galleries.
```

### Feature 5 Customer try on and saved gallery

Branch: `feat/05-tryon-gallery`

```text
$speckit-specify Feature 5: implement PRD section 4. Logged-in customers consent to photo processing, upload a full-body photo, submit a durable generation job, leave and return to its true status, and save/download/discard a labelled AI approximation. Add their private gallery and deletion. Enforce owner-only access, configurable customer/global quotas and provider budget, bounded retries, timeouts, cancellation, late-response deletion and source/unsaved-output expiry. Repeated submissions must not duplicate a job. Use the model selected by the measured saree evaluation; local/demo fixtures remain explicitly labelled.
```

Plan addition:

```text
$speckit-plan Use the existing provider adapter, API/worker modes, PostgreSQL job and spend ledger, Cloud Tasks adapter, private storage and polling UI. Persist the job before enqueueing, reconcile failed dispatch and make worker delivery idempotent. Classify ambiguous provider outcomes without blind retry. Implement max-five-minute authorized media URLs and deletion/expiry maintenance. Test quota races, duplicate deliveries, cross-customer reads, failed/unknown calls, browser reloads, worker restarts and deletion during generation. The local adapter must exercise the same state machine rather than bypassing it.
```

### Feature 6 Sales enquiries and follow up

Branch: `feat/06-enquiries`

```text
$speckit-specify Feature 6: implement PRD section 5. Customers request a callback with consent to share name/phone with the product's store and can read/reply to their own enquiries. Staff see counts/lists, atomically claim on first detail open, reassign within the same store, send public replies, add private notes, change status and inspect append-only history. Implement the specified NEW, OPEN, IN_PROGRESS, AWAITING_CUSTOMER_RESPONSE, CUSTOMER_REPLIED and CLOSED transitions. Repeated callback submissions return the existing active enquiry. Releasing an employee's access returns their active tickets to NEW. Do not add checkout or external messaging.
```

Plan addition:

```text
$speckit-plan Use PostgreSQL transactions/constraints for active-enquiry deduplication and first claim. Detail GET is read-only; the UI calls an explicit claim mutation. Preserve product snapshots, validate eligible assignees and separate PUBLIC/INTERNAL message visibility. Poll notification counts every 30 seconds while visible. Test simultaneous claims, reassignment races, lost memberships, customer reply transitions, cross-store counts and private-note leakage. Add an end-to-end customer-to-staff-to-customer journey.
```

### Feature 7 Demo data and product polish

Branch: `feat/07-demo-polish`

```text
$speckit-specify Feature 7: implement PRD section 7 and finish Phase 1 UX. Provide repeatable seeding and targeted cleanup with a dataset identifier, at least 3 users per role, 3 stores and 30 products including at least 24 sarees. Include scoped/multi-store users and enquiry histories in all statuses. Generate unique demo credentials in a local owner-readable ignored text file. Include licensed media with provenance and clearly labelled mock previews. Cleanup has a dry run, preserves all non-demo records and refuses unsafe cross-dataset references. Finish loading, empty/error states, camera-upload fallback, keyboard access and 360 px layouts.
```

Plan addition:

```text
$speckit-plan Add make demo-seed DATASET=demo-v1 and make demo-clean DATASET=demo-v1 DRY_RUN=1 or DRY_RUN=0, defaulting to dry-run. Make these local-development commands refuse production and avoid paid model calls. Store demo manifests and seed assets without retailer scraping. Protect initial production bootstrap data and handle dependency-safe cleanup. Add make smoke for non-destructive environment checks. Verify seed twice, selective cleanup with sentinel non-demo records, and the PRD acceptance journeys. Do not commit generated passwords or personal photos.
```

### Feature 8 Deploy a secure GCP demo

Branch: `feat/08-gcp-release`

```text
$speckit-specify Feature 8: make the completed Phase 1 application deployable as a secure GCP demo and satisfy PRD release acceptance. Include documented provisioning/deployment, configuration validation, migrations, private image storage and worker authorization, durable task delivery, scheduled reconciliation/expiry, server-validated CAPTCHA, quotas, monitoring, backups/restore, rollback and a non-destructive deployed smoke test. Document estimated fixed and variable cost and cleanup. Development dataset commands remain refused in production. No mobile implementation or enterprise platform.
```

Plan addition:

```text
$speckit-plan Implement docs/architecture.md with Firebase Hosting, Cloud Run API/private worker from one image, Cloud SQL PostgreSQL, Cloud Storage, Cloud Tasks, Cloud Scheduler, Secret Manager and basic monitoring. Use a separate demo project/environment. Create reviewed project-specific deployment scripts, make deploy-demo, a read-only config/cost summary mode, rollback instructions and a resource inventory for teardown. Verify Cloud Run regions supported by Firebase rewrites, __session and CSRF behavior, no-store private responses, task OIDC/IAM, non-public internal routes, max instances/database pool limits and backend service identities. Never expose provider secrets to the browser or create long-lived service-account keys. Include a bootstrap and initial-store procedure; do not open public admin registration. Do all code/config preparation before provisioning paid resources.
```

For each feature after its checks pass, commit and merge using the same pattern as feature 1, substituting its branch and commit message. Keep the feature isolated; a later feature must build on the previous merged work.

## 7 Run the completed application locally

After the relevant features have implemented and tested these targets:

```bash
make bootstrap
make dev
make bootstrap-admin
make demo-seed DATASET=demo-v1
make test
make lint
make build
make e2e
make smoke
```

`bootstrap-admin` must obtain or generate a credential securely, not accept a password in command history. Inspect the generated local demo credential file without posting it to chat or committing it. Local mock mode requires no AI account and is labelled in the UI.

After configuring authorized live-provider credentials and a consented benchmark manifest, run:

```bash
make ai-benchmark MODE=live PAIRS=3
make ai-benchmark MODE=live PAIRS=40
```

These live commands incur provider charges. The target must enforce its documented spend bound and produce reviewable scores; it must not report human visual acceptance automatically. Run the second command after inspecting the small smoke run.

Remove only the selected demo dataset:

```bash
make demo-clean DATASET=demo-v1 DRY_RUN=1
make demo-clean DATASET=demo-v1 DRY_RUN=0
```

Review the dry-run inventory before the second command. `make down` stops the stack; normal shutdown must not delete database volumes.

## 8 Configure and deploy the GCP demo

Do this after feature 8 has generated the project-specific scripts and local acceptance passes. Use a GCP project you control with billing enabled, access to the selected model and a Firebase project/site linked to it. Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) and [Firebase CLI](https://firebase.google.com/docs/cli) using their official instructions; Firebase CLI also requires a supported host Node runtime.

Authenticate and select explicit settings. Replace the project placeholder; the application region below is an example and does not determine AI processing location:

```bash
gcloud auth login
gcloud auth application-default login
firebase login
export TRYON_GCP_PROJECT='replace-with-your-demo-project-id'
export TRYON_GCP_REGION='asia-south1'
gcloud config set project "$TRYON_GCP_PROJECT"
gcloud config set run/region "$TRYON_GCP_REGION"
```

Verify that region against Hosting rewrite support and the deployment plan; configure AI location separately from the selected model's supported endpoints. Then enable the APIs the reviewed deployment uses:

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com \
  aiplatform.googleapis.com \
  recaptchaenterprise.googleapis.com \
  firebase.googleapis.com \
  firebasehosting.googleapis.com \
  --project "$TRYON_GCP_PROJECT"
```

Complete the generated deployment configuration: database size and connection limits; service identities/IAM; separate API and worker services; task queue; buckets, CORS and deletion retention; selected model/region; real CAPTCHA site/server settings; bootstrap address; budget/quotas; and Firebase rewrite configuration. Enable keyless URL signing through narrowly scoped signing and storage permissions. The Hosting-facing API permits Cloud Run invocation and enforces user authentication in Spring; its direct run.app URL must have the same authentication, CSRF, authorization and rate limits. The worker remains IAM-private.

Inspect the generated read-only config/cost summary before applying it. Then use the project deployment target, whose implementation must match the generated README:

```bash
make deploy-demo PROJECT_ID="$TRYON_GCP_PROJECT" REGION="$TRYON_GCP_REGION"
make smoke ENV=demo PROJECT_ID="$TRYON_GCP_PROJECT"
```

This stage creates billable resources. Run the full deployed customer/staff journey and a small real generation, inspect worker IAM and media access, and complete the saree-quality gate. Cloud SQL continues to cost money while the demo is idle. Use the generated resource inventory and teardown instructions when the demo is no longer needed; deleting demo business records alone does not delete cloud resources.

## 9 Resume work safely

Current Spec Kit selects the active feature using `.specify/feature.json`, not the Git branch. Switching branches alone does not select a specification. New `specify` invocations select the new feature. [Feature selection behavior](https://github.github.io/spec-kit/quickstart.html).

When resuming an older feature, find its actual generated directory rather than guessing the numbered name:

```bash
git switch feat/05-tryon-gallery
ls specs
cat .specify/feature.json
```

Then tell Codex:

```text
Resume the existing try-on-gallery feature. Read its actual directory under specs and select that feature in .specify/feature.json using the supported feature_directory field before running any Spec Kit command. Do not create a new spec. Inspect the current task and convergence reports and continue only the remaining work.
```

Alternatively, set `SPECIFY_FEATURE_DIRECTORY` to the actual feature directory and launch Codex from that terminal; unset it before creating the next feature. Do not leave an old override active accidentally.

If skills do not appear, verify the project contains `.agents/skills`, reopen/start a fresh Codex chat in that project, and confirm `specify version` matches this guide. Resolve installation differences before copying commands from older tutorials.
