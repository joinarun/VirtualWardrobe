# Tasks: Mobile customer experience

Input: spec/plan/contracts and owner-approved constitution2.0.0. Tests are explicitly requested. Check completed work only with actual evidence.

## Phase 1: Setup
- [x] T001 Reconcile owner-approved governance/PRD/architecture and create feature009 specification/plan/research/data model in .specify/memory/constitution.md, ../docs/ and specs/009-mobile-experience/.
- [x] T002 Freeze session/photo/theme contracts and review requirement coverage before source implementation in specs/009-mobile-experience/contracts/mobile.md and analysis.md.

## Phase 2: Foundations
- [x] T003 [P] Add controlled existing-worker URL redeployment tests and preserve canonical audience on subsequent rollout in scripts/gcp/deploy.py and scripts/gcp/test_deploy.py (FR-012).

## Phase 3: User Story 1 — Persistent login
Independent test: reopen/resume valid auth; stale/network responses do not cause logout; expiry/revocation still denies access.
- [x] T004 [P] [US1] Add real HTTP/PostgreSQL persistence/expiry/revocation/temp24h regressions under services/backend/src/test/java/com/virtualwardrobe/identity/ (FR-001/011).
- [x] T005 [US1] Implement persistent __session cookie and customer2592000/workforce28800/anonymous1800 idle policy plus absolute temporary expiry in services/backend/src/main/java/com/virtualwardrobe/{foundation,identity}/ and resources/application.properties (FR-001/011).
- [x] T006 [P] [US1] Add deterministic delayed anonymous/401/CSRF/network/resume regressions in apps/web/e2e/ before the corresponding fix (FR-002/003).
- [x] T007 [US1] Implement auth/CSRF generations, confirmed-guest versus reconnect state and coalesced resume revalidation in apps/web/src/{api.ts,auth.tsx,auth-context.ts} and protected route components (FR-002/003).
- [x] T008 [US1] Abort stale polling and resume read-only observation of durable jobs without duplicate mutation in apps/web/src/use-job.ts and affected preview pages (FR-003).

## Phase 4: User Story 2 — Simple mobile preview
Independent test: choose saree→add photo→view/save result without checkboxes or technical notices at360/390/430px.
- [x] T009 [P] [US2] Add real PostgreSQL/contract tests for USER_ACTION NULL legacy flags, preserved LEGACY_ATTESTATION, mixed/invalid versions and queued snapshot compatibility under services/backend/src/test/java/com/virtualwardrobe/tryon/ (FR-005/008/011).
- [x] T010 [US2] Implement additive V11 typed request basis/config/validation/snapshot compatibility in services/backend/src/main/resources/db/migration/ and services/backend/src/main/java/com/virtualwardrobe/tryon/ (FR-008/011).
- [x] T011 [P] [US2] Build compact mobile shell, safe-area bottom navigation and sticky reachable actions in apps/web/src/{App.tsx,components/Common.tsx,index.css,App.css} (FR-004).
- [x] T012 [US2] Redesign catalog/product/select-photo/result/gallery screens and wire the new processingRequest protocol in apps/web/src/pages/ and tryon-types.ts (FR-004/005/006).
- [x] T013 [US2] Remove customer provider/evaluation/dense warning/attestation UI and add passive generic Privacy view in apps/web/src/components/DemoNotice.tsx and customer page/routes (FR-006/007).
- [x] T014 [US2] Verify checkbox-free flow, pending-job reload/resume, save/delete, scope denial and no hidden true attestations in apps/web/e2e/ (FR-003/005/007/008).

## Phase 5: User Story 3 — Appearance
Independent test: all four choices apply before paint, survive reload, remain accessible and keep image colours unchanged.
- [x] T015 [P] [US3] Add safe pre-paint preference initialization and accessible Pearl/Sage/Midnight/System chooser in apps/web/public/, src/ theme modules and index.html (FR-009).
- [x] T016 [US3] Apply semantic theme tokens across customer/staff CSS and retain focus/contrast/image colours in apps/web/src/*.css (FR-009/010).
- [x] T017 [US3] Test first paint, reload/cross-tab/system/storage failure, keyboard and all-theme contrast in apps/web/e2e/ (FR-009/010).

## Phase 6: Polish and delivery
- [x] T018 Complete responsive360/390/430/desktop/landscape/keyboard/safe-area visual review and fix actual usability issues in apps/web/; record screenshots/observations in specs/009-mobile-experience/validation.md (FR-004/010).
- [x] T019 Run required backend/browser/build/lint/operator/hosted guard regressions; record actual results, secret-free review and clean source commit in specs/009-mobile-experience/validation.md (FR-012).
- [x] T020 After rootGO take a named pre-V11 backup and deploy existing services/site with unchanged cost bounds, preserve fixture data/credentials and record exact source/image/revisions in scripts/gcp/ and specs/009-mobile-experience/validation.md (FR-011/012).
- [x] T021 Verify actual deployed schema11, persistent-cookie/session/browser restart/resume/themes/mobile/customer content and private-worker/API boundaries without resetting old paid journal; record no-AI versus actual-provider evidence accurately in specs/009-mobile-experience/validation.md (FR-001/004/006/009/012).
- [x] T022 Push reviewed source to existing private GitHub main, verify code CI, finish Spec Kit convergence and deliver app/source/UX evidence with one-time legacy sign-in note in specs/009-mobile-experience/validation.md (FR-012).

## Dependencies and parallel work
T001/T002 precede implementation. Backend session work T004→T005 and photo work T009→T010 share one domain owner/build target. Frontend T006→T007→T008, mobile shell/flow and theme work share foundation ownership; frozen contracts allow backend/frontend/operator preparation in parallel. T014 waits for runtime backend readiness; do not rebuild shared target during browser proof. GCP source test/fix T003 is independent; actual deploy T020 requires T019 and separate root dispatch. T021 follows deploy; T022 requires actual UI evidence and code CI. Root owns the checklist and release dispatch. No provider call is implied by any prepared test; old paid journal stays intact.
