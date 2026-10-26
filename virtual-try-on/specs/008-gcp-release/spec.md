# Feature Specification: Hosted evaluation demo and release verification

**Feature Branch**: `feat/08-gcp-release`

**Created**: 2026-10-27

**Status**: Ready for hosted verification

**Input**: Host the completed Phase 1 application, exercise real Google try-on and customer/store flows, measure operations/performance/recovery, and publish reviewed source to GitHub while preserving the existing application.

## User Scenarios & Testing

### User Story 1 — Open and operate the hosted demo (Priority: P1)

The operator publishes a reviewed revision at a dedicated HTTPS address and can open the customer and staff experiences without changing the existing application.

**Independent test**: Deploy committed source, check readiness/account flows, and compare before/after resource inventories.

**Acceptance scenarios**:

1. **Given** committed source and the authorized target, **when** deployment runs, **then** the dedicated application serves customer/staff routes and becomes ready only after migrations and database connectivity succeed.
2. **Given** the initial temporary super-admin credential, **when** its password is rotated before fixture loading, **then** this independent bootstrap account remains outside every dataset.
3. **Given** the existing application, **when** deployment, rollback or cleanup runs, **then** its services, data, default Hosting site, secrets and budgets remain untouched.
4. **Given** dirty source, wrong targets or interrupted execution, **when** the operator retries, **then** the operation refuses unsafe changes or resumes owned resources with an accurate source revision/inventory.

### User Story 2 — Complete real customer/store journeys privately (Priority: P1)

Customers discover sarees, consent to real processing, manage private previews and request callbacks. Authorized store staff follow up through the existing enquiry workflow.

**Independent test**: Through the hosted website and direct service address, complete signup, one bounded asynchronous provider job and the customer/store journey using owned synthetic inputs and fictional accounts.

**Acceptance scenarios**:

1. **Given** signup, **when** valid or invalid verification is submitted, **then** real server-side verification succeeds or refuses invalid/missing/replayed/mismatched results, with no demo bypass.
2. **Given** adult/self-photo consent and owned synthetic inputs, **when** try-on starts, **then** a durable real-provider job reaches a terminal state and its result is labelled **AI EVALUATION DEMO**, without a fit/fidelity guarantee.
3. **Given** a successful result, **when** its owner saves, signs in again, views, downloads and deletes it, **then** valid owner access succeeds, new access stops after deletion, and another customer/workforce account cannot obtain the private image or source photo.
4. **Given** a product with or without a preview, **when** callback sharing is consented, **then** eligible staff claim, reply, receive a customer reply, reassign, close and inspect accurate public/internal history within that store.
5. **Given** guessed identifiers, duplicates, invalid uploads or direct service calls, **when** unauthorized actions are attempted, **then** existing session/CSRF/role/store/ownership/quota protections apply consistently.

### User Story 3 — Recover failures and measure operations (Priority: P1)

The operator detects failures without private data, removes abandoned media reliably, verifies an isolated restored database and measures hosted performance.

**Independent test**: Exercise cleanup retries/delayed writes, observe a safe failure event, restore a fresh isolated copy and run concurrent/mobile measurements over a separate 1,000-product dataset.

**Acceptance scenarios**:

1. **Given** abandoned uploads, replaced logos or failed deletions, **when** maintenance repeats or a delayed writer finishes, **then** only eligible unreferenced objects receive durable retryable deletion; retained/archived/saved/live and dataset-in-progress media stay protected.
2. **Given** backend/storage/task/provider failures, **when** handled, **then** users receive safe errors and monitoring identifies categories without photos, signed URLs, contacts, credentials or raw dependency exceptions.
3. **Given** an on-demand backup of the quiescent demo, **when** restored, **then** a fresh isolated copy validates migrations/core aggregate data and is removed; failed cleanup stays explicit.
4. **Given** 1,000 published products and 20 concurrent users, **when** warmed read and mobile measurements run, **then** actual results are evaluated against declared thresholds, with cold starts separately recorded.
5. **Given** a temporary load dataset, **when** targeted cleanup runs, **then** standard showroom/bootstrap/runtime/unrelated data survive and unsafe references cause refusal.

### User Story 4 — Review and continue the delivered project (Priority: P2)

The project owner receives deployed addresses, run instructions, measured results, outstanding gates and reviewed source on GitHub without secrets in the repository/report.

**Independent test**: Follow the repository runbook and match pushed revision/CI evidence to hosted release source.

**Acceptance scenario**: **Given** operational checks, **when** source/docs are published, **then** delivery identifies the exact revision, URLs, setup/rollback/cleanup commands, cost assumptions and every failed, blocked or unrun criterion.

### Edge Cases

Wrong project/region/names/dataset/revision/configuration must fail closed. Interrupted deploy/seed/cleanup/restore leaves a recoverable inventory; lookup authorization/network errors never imply resource absence. Queue redelivery, failed enqueue, stale dispatch, ambiguous provider timeout and deletion during generation preserve durable-job accounting without blind retry or resurrected content. Expired media leases and late partial writes remain retryable cleanup candidates; live references and active dataset work block deletion. Storage soft deletion, backup retention and provider retention remain distinct from application access removal. One synthetic smoke proves neither human fidelity nor statistical generation p95.

## Requirements

### Functional Requirements

- **FR-001** Operator commands MUST default to plans, require explicit execution, guard the exact demo target, resume owned resources and provide revision/rollback/cleanup inventories.
- **FR-002** Deployment MUST preserve the existing application and use a dedicated address, API/private-worker identities, migrations/readiness, scoped secrets and keyless access.
- **FR-003** The independent bootstrap super admin MUST rotate its temporary password before seeding; generated credentials MUST remain in ignored owner-only files and outside logs, argv, screenshots and Git.
- **FR-004** Hosted/direct requests MUST enforce sessions, CSRF, current role/store/object ownership and real signup verification; the public service MUST NOT expose callable worker operations.
- **FR-005** Queue/maintenance delivery MUST authenticate to a private worker, carry job IDs only, bound deadlines/retries and preserve dispatch reconciliation, idempotence and spend accounting.
- **FR-006** Browser uploads MUST bind server-selected keys, MIME, expected size and create-only writes, validate actual content and demonstrate short-lived owner media access/deletion.
- **FR-007** The demo MUST complete one bounded real-provider try-on with owned synthetic inputs, distinguish fixtures/live results, record timing/usage and keep production promotion blocked pending genuine human quality approval.
- **FR-008** Hosted journeys MUST cover signup/login/discovery, preview save/relogin/download/delete, callback without requiring a preview, claim/reply/reassign/close/history, and direct cross-store/customer denials.
- **FR-009** Maintenance MUST durably enqueue eligible abandoned/replaced/deleted catalog media and raw uploads, recover failed deletion/late writes, preserve retained/live/in-progress-dataset media and keep external I/O outside database transactions.
- **FR-010** Errors MUST use safe responses and allowlisted structured failure events; an application-scoped error counter/incident policy MUST be observable without new recipients or private payloads.
- **FR-011** An actual backup MUST be restored only to a fresh isolated copy, with migration/core-count comparison and verified removal; source data MUST never be overwritten.
- **FR-012** Performance checks MUST use a separate 1,000-product published dataset, 20 concurrent users, documented mobile network/CPU, separate warm/cold observations and targeted cleanup.
- **FR-013** Deployment MUST coordinate instance/database/worker limits, atomic AI quotas, manual generation switch, retention and alerts-only monthly budget, documenting cost/cold-start tradeoffs without a billing hard-cap claim.
- **FR-014** The repository MUST supply runnable setup/test/deploy/smoke/rollback/cleanup guidance and CI/GitHub publication tied to the hosted revision, classifying all acceptance results honestly.

### Key Entities

Release inventory/revision; owned cloud configuration; independent bootstrap account; durable media deletion candidate/task; safe failure event; dataset/credential manifest; backup/restore receipt; aggregate performance/acceptance report.

## Success Criteria

- **SC-001** A fresh browser opens dedicated customer/staff experiences and completes documented authenticated customer/store journeys.
- **SC-002** Public worker access and sampled direct cross-store/customer/guessed-media requests are refused while valid actions succeed.
- **SC-003** One actual synthetic provider job becomes terminal within 180 seconds with elapsed time/attempts/estimated usage recorded. The ≤90-second p95 target requires later sufficient samples.
- **SC-004** At 1,000 published products/20 concurrent users, warm ordinary reads meet p95 ≤750 ms excluding media/AI; every measured mobile browse run becomes usable within 3 seconds under the declared profile. Cold starts are separate.
- **SC-005** Cleanup failure/delayed-write evidence shows durable retries and preserved retained/live/dataset media; an isolated restore matches migrations/core counts and is removed.
- **SC-006** Safe failure ingestion/application monitoring are demonstrated; public source/reports contain no generated credentials/private media and unrelated resources remain unchanged.
- **SC-007** Final delivery links hosted application/pushed revision with actual results and outstanding human-quality/statistical gates; no acceptance or approval is fabricated.

## Assumptions and Clarifications

### Session 2026-10-27

Target is `virtualtryon-511016`, `asia-south1`. Existing StyleReel and the default Hosting site are preserved. Keyless user credentials exist. Base provisioning already passed 20 configuration checks; app hosting remains unproven. INR2,500/month alerts cover the entire project including StyleReel, and do not cap spend.

The maintainer selected a non-production **AI EVALUATION DEMO** with real Google generation, fictional stores and owned synthetic inputs. This operational demonstration is not production promotion or a claim that the constitutional live-model launch gate passed. A7's 40 consented human-scored pairs and statistically meaningful A9 p95 remain pending and disclosed. No quality-approval report is fabricated/enabled. Limits remain five requests/customer/day, 100 globally/day, USD5/day reserved provider spending, at most two attempts and 100 saved previews/customer.

All code/config and local checks precede a clean release-source commit. Cloud build/deploy/seed/model calls await root's explicit dispatch after that commit; the user's existing authorization is not requested again. Root owns bootstrap rotation, GitHub publication and final delivery. No mobile apps, payments, external messaging, new business service or new architectural platform are introduced. Clarification scan found no unresolved product choices; these session decisions resolve scope, privacy, cost and evidence boundaries.
