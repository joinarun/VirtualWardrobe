# Sales enquiry validation

Validated on 27 October 2026 using Java 21, Spring Boot 4.1.2 and real PostgreSQL 17 in the existing 1 GiB/70%-heap container profile. No cloud, paid model or external-message calls were made.

## Backend evidence

`docker compose run --rm backend-tests` passes **129 tests** with zero failures/errors/skips: 18 enquiry integration cases and 111 earlier-feature/security regressions. The latter include the separately reviewed provider headers-first/stalled-body deadline/response-cap checks and 13 request-body boundary checks. JSON/API mutation bodies are capped at 128 KiB before parsing; exact raw upload PUTs retain their existing content/byte limits. Declared and unknown lengths, UTF-16/JSON round trips, and an actual Tomcat chunked/encoded-path bypass attempt are covered. Full log is ignored work/feature006-tests.log. Tests use disposable PostgreSQL schemas and owned synthetic fixtures, preserving the application's records/media and current operator credentials.

The enquiry checks exercise:

- Separate current contact-sharing consent, configured retention in the notice/version, no try-on dependency, immutable product/price snapshot, duplicate active requests and archive-resistant existing enquiries.
- Simultaneous customer creation yielding one case; simultaneous claim yielding one winner/event; idempotent winner claim; read-only list/detail/counts preserving assignment, timestamps and history.
- Current store/customer boundaries, no global customer directory, a global administrator's membership requirement for self-claim, and rejected invited/disabled/customer/foreign assignees.
- A deterministic global demotion while waiting for the administration guard, verified through PostgreSQL blocking-pid state, refusing a stale-authority write.
- State/close/reopen rules, customer replies switching awaited state, closed public replies rejected, internal closure notes allowed, and customer projections excluding internal text/assignment history/actor IDs.
- Create versus reopen concurrency leaving exactly one active case.
- Membership removal/global disablement returning active work to NEW, and revocation racing claim/reassignment never leaving an ineligible assignee.
- Account deletion removing contact, initial note, public/internal messages and free-text assignment/status/reopen reasons, with customer actor names replaced and unrelated customer data retained.
- Deletion racing a staff reply without owner/store lock inversion or surviving personal text.
- Closed retention redaction even while the customer profile still has its original name; no reopen-based restoration; a new deliberate consent can create a new case.
- V8 preserves each record's promised retention and uses the shorter of current policy and that promise, so a 365-day later configuration cannot extend an older 180-day receipt.
- Retention/reopen concurrency rechecking the current state after locks.
- Actual HTTP session/CSRF, owner/workforce/anonymous private-ID denial, explicit claim POST and body-only contact search. GET search remains product-only.

V7/V8 migrate successfully against PostgreSQL. Final backend packaging succeeds; API/worker restarted and readiness passed with the V8 retention correction, whole-provider-response deadline and JSON-body cap. The final required browser regression passes against the body-cap source/runtime. Root also probed a 129 KiB signup JSON request and confirmed 413 REQUEST_BODY_TOO_LARGE plus no-store/nosniff before CSRF, with readiness 200. Existing authenticated worker maintenance and the local worker loop invoke per-record contact retention; no public cleanup route was added. No source photos, generated previews, private-media URLs or attachment references enter enquiry storage/DTOs.

## Frontend and remaining release checks

All 12 required browser checks passed with zero skips via the isolated standard make e2e-clean runner in 22.1 seconds; the real enquiry journey took 20.1 seconds. It covered callback consent/duplicates/no-preview requirement, read-only GET/list, body-only phone search, atomic claim/assignee, public/internal conversation, customer status/reassignment/close/reopen/history, access denials and account/contact/text redaction. Mobile contact/actions appear before long history, keyboard focus jumps work, and contrast/build/types/lint/whitespace checks pass. See [frontend-validation.md](frontend-validation.md) for exact evidence. All 14 tasks are complete. Demo seeding, release-scale performance and actual GCP customer-to-store smoke remain planned later features. No human saree-quality approval or deployed-release success is claimed here.
