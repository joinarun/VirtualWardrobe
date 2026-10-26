# Virtual Wardrobe

Responsive customer shopping and store workspace, developed feature by feature with Spec Kit. Product requirements and architecture are in the parent workspace's `docs/` directory. This first feature delivers the local application foundation; customer accounts, catalog and generation workflows follow in subsequent features.

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
- `/api/v1` is the public API prefix. API mode denies all `/internal/**` paths; worker mode has no public business API. No business authentication endpoints exist in foundation.
- `APP_ADAPTER_MODE=local` and `APP_IMAGE_PROVIDER=mock` are the only foundation adapters. Their output is explicitly `Demo preview`; no paid image API call is made.
- Database configuration uses standard `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`. The eventual web session cookie is `__session` for Firebase Hosting compatibility.
- Local storage and queued task references are ignored under `work/`. Private customer media and production job workers will be implemented with their own authorization/lifecycle tests.

Do not commit `.env`, credentials, photos, `work/`, build artifacts or browser reports. The private worker also requires Cloud Run IAM when deployed; application route selection is not a substitute for infrastructure authorization.
