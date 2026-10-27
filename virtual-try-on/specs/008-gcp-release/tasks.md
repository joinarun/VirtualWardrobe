# Tasks: Hosted evaluation demo and verification

Input: [plan.md](plan.md), [spec.md](spec.md), design/contracts and the existing PRD. All tasks start unchecked; earlier prepared code/base resources are not proof of hosted success.

## Phase 1 — Setup

- [x] T001 Complete formal008 spec/clarification/plan/checklist/tasks/analysis review in specs/008-gcp-release/ and record ownership before implementation.

## Phase 2 — Source foundations before any cloud build/apply

- [x] T002 [P] Finish guarded deployment/build/runtime/Hosting/source-ignore contracts and controlled no-network checks in scripts/gcp/deploy.py, scripts/gcp/test_deploy.py and infra/backend.gcloudignore (FR-001/002/004/005/013).
- [x] T003 [P] Add actual-PostgreSQL cleanup regression cases in services/backend/src/test/java/com/virtualwardrobe/media/ for replacement, delete failure/retry, lease expiry, late/partial writes, reference conflicts, retained/archived media, repeated maintenance and PREPARING/DELETING dataset protection (FR-009).
- [x] T004 Implement additive V10 cleanup_enqueued_at/raw_cleanup_enqueued_at markers, metadata enqueue/late-write guards and enqueue-before-drain wiring in services/backend/src/main/resources/db/migration/, media/MediaTransactions.java, media/MediaService.java and worker/WorkerController.java/LocalWorkerLoop.java; use the existing delete queue, no bucket sweep or I/O in DB transactions; public302 cache240s/private no-store (FR-006/009).
- [x] T005 [P] Add allowlisted SafeFailures, safe generic ProblemAdvice and job/maintenance events/tests in services/backend/src/main/java/com/virtualwardrobe/foundation/, identity/ProblemAdvice.java and worker/TryOnWorker.java, without raw exceptions/private fields or new public failure endpoint (FR-010).
- [x] T006 [P] Prepare exact-origin plan-only hosted runner and controlled guards under scripts/gcp/ or apps/web/e2e/ using contracts/release.md: one CAPTCHA attempt, journal-before-one-paid-action, held real finalize/replay412, masked screenshots and no HAR/capability leaks (FR-004/006/007/008).
- [x] T007 [P] Finalize plan-only performance/mobile/monitor/DB/backup helper sources and docs in scripts/gcp/, infra/DatabaseCheck.java and docs/gcp-release-verification.md; verify scope/cost/temporary-copy/secret handling without cloud execution (FR-010/011/012/013).
- [x] T008 Run required backend PG/browser/build/lint/operator regressions, source/credential review and clean source commit; record revision and results in specs/008-gcp-release/validation.md before root dispatches any application cloud execution (FR-001/014).

## Phase 3 — User Story 1: Hosted application (P1)

Goal: publish one accurate revision independently of visitor/provider tests. Independent check: application routes/readiness/inventory with preserved old app.

- [x] T009 [US1] After explicit root dispatch, recheck model/target inventory and run scripts/gcp/deploy.py --project virtualtryon-511016 --apply from clean source; preserve image/revision/URL inventory under ignored work/gcp/ (FR-001/002/013).
- [x] T010 [US1] Run scripts/gcp/smoke.py and actual resource/IAM/queue/scheduler/SQL/CAPTCHA/private-bucket/Hosting verification; require worker public denial and API /internal404, correct service identities/limits and unchanged StyleReel inventory (FR-002/004/005).
- [x] T011 [US1] Root rotates initial bootstrap temporary password through the real app before scripts/gcp/cloud-demo.py seeds standard data twice; compare safe receipts, preserve independent bootstrap and ignored0600 credentials (FR-003).

## Phase 4 — User Story 2: Actual customer/store journey (P1)

Goal: prove actual privacy and workflow integrations. Independent check: real hosted browser/direct requests using fictional users and owned synthetic inputs.

- [x] T012 [US2] Run the prepared hosted runner with --run for actual signup/session/CSRF/store/catalog/security checks and one real CAPTCHA attempt; record blocked risk/challenge outcomes without retries/bypass in specs/008-gcp-release/validation.md (FR-004/008).
- [x] T013 [US2] Prove real signed PUT/CORS/Blob length/type/create-only binding: hold finalize, replay while raw exists and require412, then continue original finalize; verify actual catalog/private access and cross-owner/guessed ID denials (FR-006).
- [x] T014 [US2] After root's bounded authorization, journal and execute at most one new asynchronous Google job through --allow-one-live-job; record actual queue/worker OIDC/terminal timing/attempts/usage and fixture/live distinction without human quality approval (FR-005/007).
- [x] T015 [US2] Finish hosted save/relogin/view/download/delete and callback-without-preview, staff claim/public/internal reply/customer reply/reassign/close/history journeys; exercise direct cross-store/customer denial and retain only safe aggregate evidence (FR-008).

## Phase 5 — User Story 3: Recovery and measurements (P1)

Goal: demonstrate reliable operations, actual performance and recovery separately from model quality. Independent check: scoped monitor/performance/restore reports and temporary-resource removal.

- [x] T016 [US3] Verify deployed authenticated maintenance enqueues/drains cleanup and safe retry behavior, using controlled owned test objects only; combine with actual PG late-write/reference evidence from T003/T004 in specs/008-gcp-release/validation.md (FR-005/009).
- [x] T017 [US3] Run scoped scripts/gcp/observability.py --apply, send the agreed private safe probe and observe metric/incident ingestion without channels/recipients or private fields; record sanitized evidence (FR-010).
- [x] T018 [US3] Seed the independent1000-product profile through scripts/gcp/cloud-demo.py, run scripts/gcp/performance.py and performance-mobile.mjs with actual20-user warm/mobile profile; separately observe a quiet-window cold start with startup logs, then dry-run/execute only that load dataset cleanup (FR-012).
- [x] T019 [US3] Run scripts/gcp/db-check.py and backup-rehearsal.py against the final tested JAR; restore only to a fresh strict virtualwardrobe-restore-* target, compare migration/core counts/JAR and prove deletion; resolve any pending temporary cleanup before declaring pass (FR-011).
- [x] T020 [US3] Record final cost/budget/retention/instance/pool/quota settings, rollback-compatible revisions and exact owned teardown inventory in docs/gcp-deployment.md; recheck unrelated resources after all operations (FR-001/013).

## Phase 6 — User Story 4: Reviewable delivery (P2)

Goal: owner can operate and continue the exact delivered source. Independent check: repository instructions, CI and hosted revision match.

- [x] T021 [US4] Finish docs/gcp-release-verification.md, README.md and specs/008-gcp-release/validation.md with actual passed/failed/blocked/unrun A1–A12 evidence, URLs/revisions and explicit A7/A9 statistical limitations (FR-014).
- [ ] T022 [US4] Root reviews secret-free source, pushes the intended GitHub repository and verifies ../.github/workflows/ci.yml for that revision; no credential/image/ignored-report artifacts enter Git (FR-014).

## Phase 7 — Final convergence

- [ ] T023 Review all tasks/results, source/build revision consistency, outstanding human/measurement gates and temporary-resource cleanup; root delivers actual app/GitHub links and honest remaining actions in specs/008-gcp-release/validation.md.

## Dependencies and parallel execution

T001/reviewer gate precedes implementation. Source-only T002/T003/T005/T006/T007 may proceed in isolated ownership; T004 follows its regression cases and domain contract. T008 waits for all source work and is the hard prerequisite for T009/cloud mutations. T011 follows hosted readiness; provider work follows bootstrap/seed and the separate journal/authorization. US2 and US3 hosted checks can proceed after US1 readiness, but quiesce mutation for backup counts and use a quiet window for cold measurement. Root owns release dispatch/bootstrap/GitHub; GCP owns infra/operator; domain owns media lifecycle; frontend/root own hosted UI runner. Coordinate shared build targets.

Incremental delivery: US1 supplies an operational website; US2 adds real integration evidence; US3 adds operations evidence; US4 supplies the continuation package. None independently authorizes production promotion. Failures trigger a source fix/new commit/image or an explicit failed/blocked result, never a fabricated pass or silent cost increase.


## Evidence checkpoint2026-10-27

Runtime appf87 remains unchanged. Authenticated maintenance, isolated restore/temporary-instance deletion, warm API/mobile and independently correlated cold-start checks passed. Explicit load cleanup is DELETED and all15 final baseline/object/credential/bootstrap/provider preservation checks passed. Cost/limits/rollback/teardown and delivery documentation are released. Earlier fresh-TLS client p95 failure, pre-measure platform429 and21.372s cold latency remain recorded.

First private push893414d had CI run40434284728 fail only at the E2E wrapper ownership boundary; backend178/web18/operator37/lint/build passed. Root-reviewed host UID/GID plus numeric Java user.name mapping keeps Java ownership checks intact; wrapper3/3 and exact patched fresh browser14/14 passed, zero skips. The corrective commit/push and new CI result remain pending, so T022 is unchecked. T023 is root's final convergence/delivery gate. Human40-pair approval and statistical generation p95 remain pending.
