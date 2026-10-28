# Implementation Plan: Customer interface polish

Consulted constitution2.0.0, parent docs/PRD.md and docs/architecture.md. Existing React/TypeScript/Vite frontend and Firebase Hosting remain; Java backend, PostgreSQL schema11 and private worker are unchanged.

## Constitution check

PASS. The owner explicitly requests the Buy it label while the existing enquiry form continues to explain store contact; no checkout is introduced. Private media authorization, real expiry, destructive confirmation and session behavior are preserved. No new infrastructure or model invocation. Existing assets retain provenance. All controls remain labelled, keyboard accessible and at least44px with readable themes.

## Design and ownership

- UI owner: theme.css compact existing chooser at all widths; Catalog.tsx/catalog.css/mobile.css use a real shared grid row for filter/sort instead of negative spacing; identity.css uses the owned editorial image's natural aspect ratio and containment. Focused public-fixture ui-polish.spec.ts.
- Preview owner: Preview.tsx/tryon.css group save/download/discard buttons, retain saved/terminal behavior and confirmation visibility; remove only preview dates; rename only its callback link. Focused tryon tests and affected demo selector.
- Deployment owner: scripts/gcp/deploy.py/test_deploy.py add a fail-closed frontend-only path. Verify exact owned existing services/site, current ready revisions and immutable image against inventory, unchanged backend tree, clean fullHEAD and existing Hosting release before building/publishing. Record frontend/backend revisions separately. No provisioning or backend mutation.
- Root: specification/plan/tasks, review, source gate, GitHub CI, actual hosted public smoke and release evidence.

## Data, authorization and failures

No migrations, API contracts or domain entity changes. Existing server permissions govern every save/delete/download/enquiry; fixtures must exercise visible state without new live jobs. Retention continues internally after dates are hidden. Error/retry/cancellation paths remain. Dirty source, stale backend inventory, foreign services or changed backend source must refuse frontend-only deployment. A failed publish must not claim a successful release; previous Hosting version must be recorded for rollback.

## Acceptance commands

`npm --prefix apps/web test`, `npm --prefix apps/web run lint`, `npm --prefix apps/web run build`; isolated Playwright tests for ui-polish and preview journeys in Chromium/WebKit; `python3 -m unittest discover -s scripts/gcp -p 'test_*.py'`; required regression CI via existing clean E2E runner. Tests must declare fixtures versus actual service checks. No physical-device or human image-quality claims.

## Release

Commit clean reviewed source and push feature branch for CI. Authorize frontend-only apply against that exact SHA, existing project virtualtryon-511016/asia-south1/site virtualwardrobe-511016. Verify actual hosted HTML/asset hashes, desktop login image and catalog at mobile+desktop widths. Check protected runtime/data preservation and existing backend readiness. Promote main after gates and record actual evidence; operator-only documentation may follow without another app deployment.
