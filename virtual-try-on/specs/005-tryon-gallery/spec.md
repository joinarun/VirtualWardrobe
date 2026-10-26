# Feature Specification: Private try-on jobs and gallery

**Created**: 2026-10-27 · **Status**: Ready for planning
**Input**: Complete the customer virtual try-on journey with private uploads, durable generation, bounded spending and explicit saved previews.

## User Scenarios and Testing

### User Story 1 — Consent and request a preview (Priority P1)

A signed-in customer selects an available product, reads provider and retention disclosures, confirms they are an adult uploading their own photo, uploads a clear full-body JPEG/PNG and requests a preview. They can leave and return to the persistent job.

**Independent test**: A consented valid upload produces exactly one persistent job and allowance reservation despite duplicate submissions; missing consent, invalid content and unavailable products are rejected before provider use.
**Acceptance**: Consent precedes upload and records version, provider/model and timestamp. Photo content is private to its customer. Queueing failures remain recoverable. The interface shows QUEUED, RUNNING, SUCCEEDED, FAILED, EXPIRED or CANCELLED without invented progress.

### User Story 2 — Save or remove a private result (Priority P1)

A customer views their own result with an accurate AI/demo label and appearance/fit limitation, explicitly saves it, downloads it or discards it. Saved previews persist across logins and remain accessible when a product is later unavailable.

**Independent test**: A saved preview survives login and product archival; a different customer and every workforce account receive no photo access. Deleted content immediately loses application access and cannot return after a late provider response.
**Acceptance**: Saved gallery limit is100 per customer. Saving is idempotent. Unsaved outputs expire within24hours. Source images are deleted after terminal processing and within24hours of upload. Issued media links expire within5minutes.

### User Story 3 — Handle failures and control costs (Priority P1)

Customers see clear technical errors and deliberate retry choices. Operators can stop generation and enforce daily limits while the service safely reconciles interrupted dispatch and processing.

**Independent test**: Concurrent requests cannot exceed customer/global allowance or provider budget. Confirmed transient rejection permits at most one automatic retry; ambiguous provider outcome never automatically retries. Technical failure refunds customer allowance without erasing independent provider accounting.
**Acceptance**: Initial limits are5 customer requests/day,100 global requests/day and US$5 provider budget/day. Work survives restart and duplicate delivery. Cancellation, expiry and account deletion prevent late result attachment. Jobs reach a terminal state by180seconds under documented demo load; p95 completion target is90seconds.

### User Story 4 — Understand evaluation mode (Priority P2)

A local fixture preview is explicitly labelled Demo preview. A hosted live demo identifies its actual provider/model, states AI EVALUATION DEMO and explains that the40-pair human saree-quality gate remains pending.

**Independent test**: Fixture output never claims to be live. Production live generation fails closed without a matching operator-approved quality report. The hosted evaluation demo may exercise real generation under its quotas without claiming production approval.

## Edge Cases

Repeated create/save/cancel/discard, same idempotency key with changed input, stale consent version, forged/expired/replayed upload, invalid MIME/content,20MP image allocation, dispatch failure, queue duplicate, delayed task, transient retry, unknown outcome, worker crash, cancel/delete during provider call or save copy, account deletion, gallery-limit race, product archive, budget exhausted, maintenance storage failure and saved objects excluded from unsaved expiry.

## Requirements

- FR-001 Only authenticated customers can consent, upload source photos, create jobs and manage their own private results; workforce roles never grant customer-photo access.
- FR-002 Before upload, record affirmative adult/self-photo/provider-processing consent against the current disclosure version, provider/model and retention text.
- FR-003 Accept one actual JPEG/PNG image up to10MiB and20MP, remove metadata, preserve orientation and prepare bounded provider-supported input; unvalidated photos cannot reach a model.
- FR-004 Create jobs with persistent idempotency and atomic customer/global allowance and conservative per-attempt spend reservation before dispatch. Duplicate intent returns the existing job; changed intent with the same key conflicts.
- FR-005 Dispatch and processing survive restarts, failed enqueueing and duplicate delivery. Claims and late completion use conditional state/token checks.
- FR-006 Expose real job states and safe errors. Permit at most one automatic retry for an explicitly retryable provider response; unknown outcomes require deliberate new work and retain conservative accounting.
- FR-007 Technical failure, cancellation and expiry refund customer allowance once; independently preserve started-attempt spend and reported usage. Enforce configurable daily limits and a manual generation kill switch.
- FR-008 Bound work and resource concurrency; expire abandoned work and make every job terminal by its deadline. Reconcile undispatched jobs and interrupted work.
- FR-009 Cancellation, discard, gallery deletion and account deletion immediately stop new application access and prevent late upload/provider/save responses from restoring deleted media.
- FR-010 Show AI-generated appearance/drape/fit limitations; local fixture results and real evaluation-demo results have distinct truthful labels.
- FR-011 Saving is explicit and idempotent, with a concurrency-safe100-item limit. Owner-only gallery, download and deletion work across login and product availability changes.
- FR-012 Source photos are removed after terminal processing and within24hours; unsaved outputs expire within24hours; saved outputs persist until deletion. Schedule explicit object removal within24hours and retry failed deletion.
- FR-013 Private media access uses owner checks and no-store responses; issued URLs expire within5minutes. Photos and capabilities never appear in logs, staff views or analytics.
- FR-014 Public API mode exposes no worker routes. Queue and maintenance delivery authenticate to a private worker; queue payloads contain job identifiers only.
- FR-015 Production Google generation requires an explicitly operator-approved report matching the selected model and completed human quality gate; local fixtures remain available and the demo is clearly an evaluation environment.
- FR-016 Responsive accessible customer pages support consent/upload, returning to jobs, polling, save/download/discard/cancel and clear quota or unavailable explanations.

## Success Criteria

- SC-001 A customer completes a private upload-to-result-to-save/download/delete journey and can return to their jobs after closing the page.
- SC-002 Direct access, races and duplicate-delivery checks prove owner isolation, one local job per idempotent intent, one allowance charge and no late resurrection.
- SC-003 Fault checks demonstrate dispatch reconciliation, bounded retries, unknown-outcome handling, quota refunds and independent provider-spend accounting.
- SC-004 Source/unsaved expiry and account deletion prevent new access, while saved previews remain accessible until explicitly deleted.
- SC-005 Fixture, live evaluation and production-approved modes remain visibly and operationally distinct; human quality approval is never fabricated.

## Key Entities

Consent receipt, private photo/media, try-on job, attempt/usage ledger, daily customer/global counters, dispatch delivery and saved-preview metadata.

## Assumptions and Clarifications

### Session2026-10-27

PRD and constitution defaults resolve all routine choices. Daily limits use UTC and disclose reset time. A deliberate retry creates a new job/idempotency key from a newly consented source upload when the old source has been removed. Customers can still request callbacks independently in the later enquiry feature. Real provider calls are performed only by authorized deployment smoke tests, not by development tests. The existing40-pair human quality gate remains pending and blocks production promotion, while an explicitly labelled hosted evaluation demo can call the real provider under spending limits.
