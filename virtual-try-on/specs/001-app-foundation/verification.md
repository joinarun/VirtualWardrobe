# Foundation acceptance evidence

Verified 2026-10-26 on the user's Apple Silicon macOS host with Docker28.3.2. The application remains running locally. No cloud credentials or paid image APIs were used for foundation verification.

| Check | Result |
| --- | --- |
| make bootstrap | PASS: generated owner-only ignored local .env; built API/web development images. |
| make dev | PASS: packaged Java21 backend once, started PostgreSQL/API/worker/web, printed localhost5173 and8080 URLs. |
| make test | PASS: four backend tests against real PostgreSQL (migration, mock label, invalid mode, storage traversal) and frontend TypeScript compilation. |
| make lint | PASS: Oxlint0 warnings and0 errors. |
| make build | PASS: Java runtime image and production React build. |
| Browser smoke | PASS: two Playwright tests from the e2e container, exercising distinct customer/staff layouts including360px viewport, API liveness and forbidden internal route. The make e2e stages (readiness, e2e image build, e2e run) were executed separately. |
| Liveness/readiness | PASS: both200 with DB up; DB stop produced liveness200 and readiness503; DB restored and readiness returnedUP. |
| API/worker separation | PASS: API /internal/tasks/try-on403; worker /api/v1/health403. |
| GitHub workflow placement | PASS: workflow lives at parent Git root .github/workflows/ci.yml, uses virtual-try-on as default run directory. Actual hosted runner executes after push. |

A naming collision between the FoundationSecurity configuration bean and filter-chain bean was found and fixed. Browser smoke found Vite's container hostname rejection; the dev server now allows exactly web and localhost in addition to its default IP handling. Both failed checks passed after those fixes.

Docker bases and PostgreSQL are pinned by immutable multi-platform digest. Chromium155.0.8059.84-r0 is pinned for the local isolated browser container. Maven Wrapper3.10.0 and npm lockfile are included. Secrets, generated credentials and local artifacts are ignored.

The custom requirement checklists were reviewed before implementation; they are not test-completion checklists. Installed Spec Kit scripts resolved the spec, plan and tasks. Analysis found complete requirement coverage and no constitution conflict. No extension hooks were registered. Final convergence reads001 explicitly with SPECIFY_FEATURE_NO_PERSIST=1, preserving the concurrently selected002 feature pointer.

These results cover the foundation only. No customer auth, real generation, saree benchmark, business UI or deployed production quality is claimed here.
