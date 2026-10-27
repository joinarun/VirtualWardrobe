# Implementation Plan: Mobile customer experience

Branch feat/09-mobile-experience; specification spec.md; governing constitution2.0.0. Owner's request approves the photo UX and persistence amendment. No unresolved clarifications.

## Technical Context
Java21/Spring Boot/PostgreSQL/JDBC sessions and Flyway; React/TypeScript/Vite; existing GCP Hosting/API/private worker, no new infrastructure. Existing schema10 advances additively to11. Shared application image remains one codebase. Existing quotas/retention/owner authorization/revocation are retained.

## Constitution Check
PASS after explicit v2 amendment: no photo checkbox/provider banners; actual user-action receipts replace unattested booleans. Existing legacy receipts remain truthful. Private storage, CSRF, short signed URLs, roles, limits and operator quality gates remain. Persistent browser cookie plus role-specific server idle limits and temporary-credential expiry preserve revocation. Themes store only a validated enum; no credential/photo local persistence. Automated UX tests are required by the owner. No enterprise/mobile-binary infrastructure.

## Phase 0 — Decisions
See research.md: session cookie lifetime, auth/CSRF epochs, reconnect semantics, typed processing requests, native mobile shell, semantic themes and staged release. Local code inspection found cookieMaxAge absent,8h server idle, unversioned load/CSRF writes and missing resume refresh. These are credible mechanisms; actual tests must distinguish proof from hypothesis.

## Phase 1 — Contract and Data
See data-model.md and contracts/mobile.md. Existing f87 cookies receive persistence at the next actual sign-in; no unsafe bulk session-ID rotation. V11 preserves legacy rows/default writes and permits a USER_ACTION basis with NULL legacy flags. New worker accepts both valid bases; mixed/invalid requests fail. New API must be deployed after the compatible worker. Snapshot/provider metadata stay truthful internally.

## Phase 2 — Parallel Implementation
- Domain owns services/backend session policy, request validation/migration11 and real PostgreSQL/HTTP tests.
- Foundation owns apps/web customer shell/pages/existing CSS/auth/CSRF/polling and local browser tests. Product imagery remains unfiltered. Staff remains separate with readable themes.
- GCP owns scripts/gcp deployment environment and safe existing-worker URL reuse, controlled operator tests and the isolated theme module/chooser/pre-paint files. Release operations require root's source gate.
- Root owns constitution/PRD/architecture/spec009/contracts/tasks/analysis, the separate hosted mobile smoke, review, release dispatch and GitHub.

## Validation
Run targeted backend/HTTP and browser regressions, then full required suites/build/lint/guard checks. Deterministically hold old anonymous/401/CSRF replies across auth transitions; simulate offline/online/pageshow/visibility and stalled job reads; reopen using persistent cookies only; check expiry/revocation and temporary24h boundary. Run360/390/430+desktop, keyboard/landscape, sticky action/keyboard/safe-area/no-overflow, all themes and automated accessibility/contrast. Prove USER_ACTION NULL flags and legacy compatibility on PostgreSQL. Actual hosted no-AI session/browser restart/resume/theme/customer-route tests and generic smokes must validate deployed image/source. Human garment scores are not fabricated.

## Release
Commit clean reviewed source, take a named pre-V11 source backup, build/deploy same project/services/site, verify schema11/readiness/public/internal/worker boundaries and existing user/data preservation. Reuse canonical existing worker URL on redeploy to avoid blank-audience interval. Keep protected credentials and paid-action journal unchanged. No automatic new model request; root may separately authorize a bounded validation job only if necessary. No large load/restore repeat for this scoped change. Push main and verify code CI. Rollback must keep V11/USER_ACTION-compatible worker/API once new records exist; old static UI may require a coordinated build rather than blindly restoring f87 pinTag.
