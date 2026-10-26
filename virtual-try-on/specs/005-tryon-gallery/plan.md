# Implementation Plan: Private try-on jobs and gallery

**Date**: 2026-10-27 · **Spec**: [spec.md](spec.md)

## Summary and technical context

Extend the single Java21/Spring Boot/PostgreSQL backend and React customer UI. Flyway V5/V6 add separate customer-private media, consent receipts, jobs, attempts, daily counters and a durable local delivery queue. Reuse MediaStorage and the bounded ImageProcessor; never serve private photos through catalog media routes. Downscale provider inputs to a2048px long edge and normalized JPEG under10MiB, preserving full normalized garment references in the catalog.

Cloud Tasks dispatches deterministic job/sequence deliveries with Google OIDC to the existing private worker path. Add the verified Google Cloud Tasks Java2.99.0 SDK and Cloud SQL PostgreSQL connector before deployment. Local worker polls a PostgreSQL queue; its Java executor is an execution mechanism, not the durable queue. The same image runs API or worker; API internal paths stay404. Cloud authentication verifies token audience, issuer and expected delivery/maintenance identity in addition to Cloud Run IAM. Local internal HTTP is unavailable unless an explicit local-only token is set.

## Constitution check

Pass: one shared backend/database/API, owner-only private images, pre-upload consent, bounded generation spend, persistent jobs/idempotency, no fabricated progress/quality, private worker and authenticated maintenance, PostgreSQL concurrency evidence and no cloud mutations during development. No extra infrastructure beyond the approved baseline. Enquiries remain feature006. The existing40-pair human benchmark is pending; real hosted mode is explicitly an AI EVALUATION DEMO. Production Google work requires an operator-approved matching quality report and never receives fabricated approval.

## Transaction and concurrency design

Lock order is owner account, UTC daily global counter, job/media row. Account locks serialize allowance, gallery limit, save/delete and account deletion. A singleton/day global row atomically serializes global request and spend reservations. Job creation persists an immutable idempotency key/fingerprint and a first attempt reservation before dispatch. Duplicate intent returns its existing job even if quota is now exhausted; changed intent conflicts. Global accepted-request count is not refunded; customer allowance is refunded exactly once on terminal failure/cancel/expiry. Per-started-attempt conservative spend remains independently committed, with observed estimated usage recorded separately. Never promise exactly-once provider execution or an external billing cap.

Each attempt has a random execution token, dispatch sequence, reservation and provider outcome. Claiming is conditional on QUEUED/current sequence and an unexpired job. It rechecks owner enabled, source ownership/validation and current product availability. The worker records provider-start before external invocation. Confirmed429/503 may schedule one automatic retry after atomically reserving its extra spend. Unknown transport outcomes and stale RUNNING work become terminal with UNKNOWN_OUTCOME and no blind retry. All jobs have a creation deadline of180seconds. Completion atomically verifies current execution token/state/deadline/account and prevents late resurrection after cancellation/deletion.

All storage/provider work occurs outside held database transactions. Source and output writes use server-selected purpose/owner keys. Save reserves a gallery slot as SAVING, copies to a saved prefix outside the transaction, then conditionally activates only if owner/job/media and the unique expected pending key are still valid. Five-minute stale-save recovery releases the pending slot and schedules the old copy for deletion; a retry never reuses that object key. Duplicate saves return the same media ID; concurrent deletion wins. Cleanup tombstones expired/removed media immediately and retries physical deletion from the database. Saved prefixes are excluded from unsaved lifecycle backstops. Deletion/account deletion cancels jobs, schedules both current and in-flight keys for removal and prevents late attachment.

## Modes, disclosure and budget

GET/try-on/config identifies provider/model/location, consent version, retention, AI limitation, readiness and FIXTURE/EVALUATION_DEMO/LIVE mode. Google global processing is disclosed as potentially outside India; provider policy may include abuse-monitoring retention, so the UI makes no zero-retention promise. Mock uses no provider spend and is always labelled Demo preview. Known model1K/candidateCount1/maxOutputTokens2048 plus bounded inputs use an initial conservative US$0.25 reservation per potential provider attempt; retain that conservative amount after a started call, even when observed estimated usage is lower. A clearly unstarted or unbilled attempt can release its reservation. APP_GENERATION_ENABLED is the operator kill switch. UTC daily limits default5/customer,100global,US$5budget. Pricing/model changes require explicit review and adequate reservation configuration.

## Failure and maintenance paths

Creation commits before dispatch; enqueue failure leaves the job queued for reconciliation. Deterministic delivery names make repeated enqueue safe. Workers claim each paid attempt once; duplicate delivery acknowledges without repeating a RUNNING or terminal call. Local deliveries remain durable until processed. Maintenance reconciles queued/un-dispatched jobs, expires deadlines and24hour uploads/unsaved outputs, schedules source cleanup after terminal state and retries object deletion. Orphan quarantine keys remain on tracked source rows until deleted. Provider results are validated/normalized before attachment and removed if the final guard fails.

## Source ownership and acceptance

Backend owns schema, private media/state transactions, provider-input preparation, job worker/maintenance, security/config, properties and backend tests. Frontend owns apps/web and browser tests against contracts/api.md. GCP agent owns isolated GcpTaskDispatcher/Gcp worker-token verifier plus controlled SDK tests after interface handoff. Root owns cloud provisioning and bounded live smoke; this feature makes no paid calls during development.

Test real PostgreSQL for owner isolation, idempotency and quota/gallery races, duplicate claims/delivery, failed enqueue/reconciliation, transient/unknown provider outcomes, refunds versus spend, cancellation/account deletion during slow provider/save, late results, expiry/deletion retry, and worker authentication/mode boundaries. Use deterministic test providers and injected storage failures. Preserve catalog/identity checks; run actual browser fixture upload→job→save/download/delete and returning to pending jobs. Deployed live GCP workflow, human quality review and release-scale performance remain separately identified evidence.
