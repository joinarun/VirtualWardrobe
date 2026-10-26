# Tasks: Private try-on jobs and gallery

## Phase1 Setup

- [x] T001 Add V5/V6 consent/private-media/job/attempt/day/local-queue schema, supported task/CloudSQL dependencies and configuration.
- [x] T002 Implement provider/disclosure/quality-gate configuration and bounded2048px provider JPEG preparation.

## Phase2 Private upload and transport

- [x] T003 Implement owner-only consent/source authorization, raw upload and validated finalization in services/backend/src/main/java/com/virtualwardrobe/tryon/.
- [x] T004 Implement TaskDispatcher sequence contract, durable local queue and worker mode authentication/routes.
- [x] T005 [P] Implement isolated genuine GcpTaskDispatcher and GcpWorkerTokenVerifier with controlled SDK/security tests.
- [x] T006 [P] Implement customer consent/upload/config/quota frontend in apps/web/src/ against contracts/api.md.

## Phase3 Durable generation

- [x] T007 Implement atomic idempotency/customer/global/spend reservations and persistent job DTO/read/cancel/discard services.
- [x] T008 Implement conditional worker claim, provider-start tracking, bounded execution, transient retry and independent attempt accounting.
- [x] T009 Implement dispatch reconciliation, absolute deadlines, abandoned source/output expiry and retryable object deletion.
- [x] T010 [P] Implement returning job list/detail/polling/errors/cancellation and truthful fixture/evaluation labels in apps/web/src/.

## Phase4 Saved gallery

- [x] T011 Implement explicit race-safe save/copy/activation,100-item limit, gallery/download/delete and account-deletion listener.
- [x] T012 [P] Implement gallery/save/download/discard/delete and unavailable-product states in apps/web/src/.

## Phase5 Verification

- [x] T013 Verify ownership/consent/idempotency/quota/gallery races against real PostgreSQL and genuine HTTP/CSRF boundaries.
- [x] T014 Verify duplicate claim/delivery, failed dispatch, retry/unknown outcome/refunds, deadline, cancellation/deletion during provider/save and cleanup failures with controlled providers/storage.
- [x] T015 Verify worker JWT/mode boundaries and production quality fail-closed behavior without paid calls.
- [x] T016 Run actual browser fixture upload→job→return→save/download/delete, prior-feature regression, build/lint and record specs/005-tryon-gallery/validation.md.

## Dependencies

T001/T002 precede domain implementation. Transport/GCP and frontend may proceed in parallel after interface/JSON freeze and reviewed checklist. T007 precedes worker processing; gallery and cleanup share private-media states. All evidence/convergence precedes feature006. No development test makes paid provider calls or approves the human quality gate.
