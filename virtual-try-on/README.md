# Virtual Wardrobe

Responsive customer shopping and store workspace, developed feature by feature with Spec Kit. Product requirements and architecture are in the parent workspace's `docs/` directory. Feature specifications record the implemented scope and acceptance evidence.

## Run locally

Prerequisites: Git, Make, and a running Docker engine with Compose v2. Java21 and Node24 are supplied by containers; host Java/Maven are not required.

```bash
make bootstrap
make dev
```

Open http://localhost:5173 for the customer storefront and http://localhost:5173/staff for the store workspace. API liveness is http://localhost:8080/api/v1/health; dependency-aware readiness is http://localhost:8080/actuator/health/readiness. Local PostgreSQL is bound to127.0.0.1:5433. `make bootstrap` creates an ignored `.env` with a random local database password. It never requires cloud credentials.

```bash
make test
make lint
make build
make e2e
make down
```

`make down` stops services without deleting the database volume. Initial dependencies and browser images need network access. Inspect `docker compose logs api worker web db` if startup fails. A stopped Docker engine produces an actionable prerequisite error.

## Architecture

- `services/backend`: Java21 / Spring Boot4.1.2 / Maven Wrapper3.10.0 / PostgreSQL/Flyway. One codebase and image, selected with `APP_MODE=api|worker`.
- `apps/web`: React19 / TypeScript6 / Vite8. Customer and staff layouts are separate.
- `/api/v1` is the public API prefix. API mode denies all `/internal/**` paths; worker mode has no public business API. Customer and workforce credentials are separate, with store-scoped workforce memberships.
- `APP_ADAPTER_MODE=local` and `APP_IMAGE_PROVIDER=mock` are the safe local defaults. Mock outputs are explicitly `Demo preview`. The provider evaluator supports an opt-in live Google mode with bounded spending and separate human scoring.
- Database configuration uses standard `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`. Web sessions persist in PostgreSQL and use the `__session` HttpOnly cookie, CSRF headers and credential-version checks.
- Local media objects are ignored under `work/`. PostgreSQL stores durable local task deliveries, generation attempts, customer allowances and provider spend reservations. GCP uses private Cloud Storage and Cloud Tasks behind the same service interfaces.

Do not commit `.env`, credentials, photos, `work/`, build artifacts or browser reports. The private worker also requires Cloud Run IAM when deployed; application route selection is not a substitute for infrastructure authorization.

## Accounts and stores

Run `make bootstrap-admin` to create the first super admin if none exists. Generated credentials are written once to a local owner-readable file, with the location reported by the command. Workforce temporary passwords expire after 24 hours and require rotation. If a browser test rotates the local operator password, its current fixture remains only in ignored `work/e2e/admin-credential.json`; the initial bootstrap file is then stale.

Customers use mobile/password signup, explicitly unverified phone numbers, and hashed one-use recovery codes. Local signup uses an explicit local test CAPTCHA adapter. Cloud signup must use real server-validated CAPTCHA and fails closed if configuration is missing.

Super admins create pending stores and workforce accounts. An invited store admin signs in, changes their temporary password, accepts their membership and activates the store. Store admins manage only their stores and memberships. Database transactions protect the last active global/store administrator, and membership removal preserves audit history.

## Virtual try-on

Customers open an available product, select **Try it on me**, and consent before uploading their own adult photo. Requests survive navigation and refresh. Customers can cancel work, explicitly save results to their private gallery, download them, or delete them. Store employees have no customer-photo access through the application.

Local development uses deterministic previews with no paid model calls. The hosted demo uses Google in an explicitly labelled evaluation mode. Production live generation fails closed until an operator supplies a matching human quality review. The 40-pair saree benchmark remains a human review gate; neither fixture tests nor a successful provider call establish garment fidelity.

Source photos are removed after terminal processing and within 24 hours. Unsaved outputs expire within 24 hours. Saved outputs persist until deletion. Removal prevents new application access immediately; previously issued private URLs expire within five minutes, and cloud backup/soft-delete retention is separate. Daily customer, global-request and provider-spend limits are configurable and checked transactionally.
