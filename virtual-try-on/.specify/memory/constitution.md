# Virtual Try-On Constitution

## Core Principles

### I. Complete Phase 1 Journey and Small Shared Architecture

Phase 1 MUST deliver a responsive customer website and a separate staff workspace for
catalog discovery, personal AI previews, private saved images and store callback enquiries.
Sarees are the priority category. A callback request MUST work without generating or saving
a preview and MUST be represented as a sales enquiry. Payments, checkout, confirmed orders,
mobile applications, live inventory, size prediction, realtime chat, external notifications,
video generation and live camera AR are outside Phase 1.

The system MUST use one modular backend codebase, one relational database and one versioned
public REST API at `/api/v1`. API and worker deployments MUST share the backend image and
domain rules. Future mobile clients MUST reuse the domain API; mobile authentication and
interfaces MUST be designed when that phase begins. New infrastructure MUST have a documented
requirement that the baseline cannot satisfy. This keeps permission rules and transactions
consistent while limiting operational cost.

### II. Server Authorization and Customer Privacy

Every backend operation MUST enforce current identity, store membership, role and object
ownership, including media authorization, counts, background work and direct API requests.
Submitted identifiers and hidden interface controls MUST NOT establish authorization.
Workforce and customer credentials MUST remain separate. Store roles MUST be scoped to a
membership; super-admin status MUST NOT grant customer impersonation or a gallery browser.
Membership revocation MUST take effect on the next authorized API request.

Customer source photos, generated previews and saved images MUST use private storage and
owner-authorized access with a short expiry. Enquiries MUST NOT expose these images to staff.
Before upload, the customer MUST consent to the identified provider's processing and disclosed
retention; Phase 1 accepts only adults uploading their own photos. Consent records MUST include
version and timestamp, and generation records MUST identify provider and model. Callback
submission MUST obtain separate agreement to share the customer's contact details with the
selected store. Photos and enquiry text MUST NOT enter analytics.

Deletion MUST prevent new application access immediately. Deletion and cancellation MUST
prevent late provider responses from restoring removed content. Retention, provider terms and
any processing across regions MUST be disclosed accurately. Backup and soft-delete retention
MUST be documented separately from access removal. These rules apply throughout a job's
lifecycle, including failures, retries, account deletion and abandoned uploads.

### III. Durable Jobs and Bounded AI Spending

Generation MUST persist its job and atomically reserve customer quota and estimated provider
spend before dispatch. Work MUST survive browser closure, process restarts, failed enqueueing
and duplicate queue delivery. Transactional claims, idempotency, bounded execution, dispatch
reconciliation and scheduled cleanup are mandatory. Public API deployments MUST NOT expose
callable worker routes; task and maintenance delivery MUST authenticate to a private worker.

The customer MUST see real QUEUED, RUNNING, SUCCEEDED, FAILED, EXPIRED or CANCELLED states,
recoverable errors and deliberate retry actions. Fabricated percentage progress is prohibited.
A refresh or duplicate submission MUST NOT duplicate a local job, successful result or customer
allowance charge. Provider outcomes MUST be tracked separately: an UNKNOWN_OUTCOME MUST NOT
trigger a blind retry or an exactly-once provider guarantee.

Generation MUST enforce atomic customer/global limits, a provider-spend budget, bounded worker
concurrency and a manual kill switch. One output per request is the default. At most one
automatic retry is allowed for a clearly retryable failure. Terminal technical failures MUST
release customer allowance while preserving independent accounting for potentially billed
provider work. Billing alerts MUST supplement application spending controls. Model selection
MUST use a configurable provider adapter and measured saree quality, latency and cost per
human-accepted result. Model identifiers, lifecycle and rates MUST be rechecked during planning
and before live deployment.

### IV. Transactional Rules and Auditable Enquiries

Database transactions and an explicit concurrency design MUST protect the final active super
admin, the final active admin of every active store, quota reservations, enquiry deduplication
and exclusive enquiry claims. A store MUST remain PENDING and hidden until its first active,
accepted admin membership exists. Membership changes MUST preserve historical attribution;
adding a membership MUST NOT reset an existing user's password. Existing users MUST accept
invitations while authenticated before gaining membership.

There MUST be at most one active enquiry per customer/product/store combination. Duplicate
submissions MUST return that enquiry; each enquiry MUST preserve the product title, reference
and displayed price snapshot. Claiming MUST be an explicit mutation with one eligible winner
under concurrency. Read-only GETs and list viewing MUST NOT change assignment. Reassignment
MUST remain within active memberships of the same store. Loss of store access MUST return
that person's active assignments to the unassigned NEW queue with an audit event.

Assignment, status transitions, messages and internal notes MUST retain append-only actor/time
history. Customer-visible replies and internal notes MUST be distinguished on the server;
customers MUST see only their own enquiries and public events. Status transitions and closure
rules MUST follow the PRD. Archival MUST hide the affected catalog from discovery and prevent
new generation/callback requests while preserving existing enquiry workflows and snapshots.
These requirements make concurrent staff work reliable and retain an explanation of every
change.

### V. Demonstrable Quality and Honest Results

Each feature MUST have runnable acceptance evidence tied to its specification and the PRD's
release criteria. Changes MUST preserve already working journeys. Authorization boundaries,
database concurrency, authentication recovery, idempotency, failure reconciliation, deletion
during generation and demo cleanup MUST have evidence that exercises their actual boundaries.
Transactional behavior MUST be tested against PostgreSQL; mocks or an in-memory database
alone are insufficient.

Live outputs MUST be labelled as AI-generated previews and explain that appearance, garment
details and drape may differ and that they provide no size or fit guarantee. Saving MUST be
explicit. Deterministic fixtures MUST be labelled **Demo preview** and MUST remain clearly
distinguishable from real provider results. A live release MUST meet the saree benchmark;
provider marketing and fixture output MUST NOT serve as evidence of live quality.

Assets MUST have documented source, licence or consent and permitted usage. Retailer scraping
or a demo label MUST NOT substitute for permission. Demo seeding MUST be repeatable and make
no paid AI calls by default. Every seeded record and object MUST carry a dataset ID; cleanup
MUST support a dry run, reject unsafe cross-dataset references and preserve unrelated data and
the production bootstrap account. Demo mutations MUST be refused in production.

## Architecture and Operational Constraints

- The baseline MUST use Java 21 LTS, a supported Spring Boot release, Spring Security and the
  Maven Wrapper; React, TypeScript and Vite; PostgreSQL with Flyway migrations; and PostgreSQL
  search. Exact dependency and container versions MUST be pinned after support verification,
  with dependency lockfiles and the Maven Wrapper committed.
- GCP deployment MUST use Firebase Hosting, Cloud Run API and private worker, Cloud SQL,
  Cloud Storage, authenticated Cloud Tasks and Cloud Scheduler, Secret Manager, and operational
  logging/monitoring. Local PostgreSQL MUST support development before a shared cloud demo is
  needed. Kubernetes, service mesh, Kafka, Redis, Elasticsearch, separate business microservices,
  a separate Python image service and generalized AI-agent infrastructure are outside this MVP.
- Web authentication MUST use server-side sessions persisted in PostgreSQL with Secure,
  HttpOnly, SameSite cookies and CSRF protection. Firebase Hosting's API rewrite MUST use the
  `__session` cookie and a session-backed CSRF bootstrap endpoint with no-store caching. Private
  and authentication responses MUST use `Cache-Control: no-store`. The direct API URL MUST
  enforce the same Spring Security rules. Session secrets MUST NOT enter browser local storage.
- Customer phones MUST be normalized, unique and marked unverified while OTP is deferred.
  CAPTCHA MUST be validated on the backend. Customer recovery MUST require an unused recovery
  code stored only as a hash and MUST revoke existing sessions; phone knowledge or workforce
  administration MUST NOT enable recovery. Workforce temporary credentials MUST expire after
  24 hours and require rotation before business access. Logout, password changes, recovery and
  account disablement MUST revoke the relevant sessions.
- Upload authorization MUST select object keys on the server and recheck ownership/store scope
  at finalization. The backend MUST validate actual file content, dimensions, size and video
  duration, strip image metadata and reject invalid media before publication or provider use.
  Catalog derivatives and private customer media MUST have separate access policies. Videos
  MUST remain catalog content in Phase 1.
- Initial configurable retention limits MUST delete source photos after terminal processing
  and within 24 hours of upload, expire unsaved outputs within 24 hours, limit saved previews
  to 100 per customer, and expire issued private-media URLs within five minutes. Explicit
  discard/deletion MUST schedule object deletion within 24 hours. Saved outputs MUST remain
  until deletion or account deletion. Enquiry contact retention MUST initially be 180 days
  after closure; active enquiries follow the PRD's reviewed deletion process.
- Initial configurable generation limits MUST be five requests per customer per day, 100
  globally per day and a US$5 daily provider budget. Configuration changes MUST preserve
  atomic enforcement and be recorded with their operational rationale.
- Secrets, generated passwords, recovery codes and service-account keys MUST stay out of Git
  and logs. Service identities MUST use least privilege and keyless access where supported.
  Logs MUST exclude photo content, signed URLs and unnecessary customer identifiers. Local,
  demo and production configuration MUST be distinct. Generated demo credentials MUST use an
  ignored local file with owner-only permissions and MUST NOT be printed in CI.
- Deployment MUST configure worker IAM, authenticated maintenance, upload CORS, database pool
  and instance limits together, budget alerts, media lifecycle/soft-delete retention, database
  backups and restore instructions. Health checks, structured logs, error monitoring and a
  tested migration path are required. Cloud SQL's persistent cost and Cloud Run cold starts
  MUST be included in documented deployment assumptions.

## Development Workflow and Quality Gates

1. Work MUST follow specification, clarification where needed, plan, tasks, analysis and
   implementation for one feature at a time using the repository's Spec Kit workflow. Plans
   MUST include a constitution check, ownership/store boundaries, migrations, failure paths,
   acceptance commands and any additional infrastructure justification. The PRD defines
   behavior; the architecture document supplies the implementation baseline.
2. Feature evidence MUST cover the affected customer and staff journeys and regression checks
   for existing features. The release MUST satisfy PRD acceptance criteria A1–A12, including
   signup/recovery, cross-store and cross-customer API denial, guessed object/media identifiers,
   concurrent final-admin protection and claims, duplicate submission/delivery, quota refunds,
   failed dispatch, bounded jobs, late results after deletion, and accurate public/internal
   enquiry history. Test commands, environment and results MUST be recorded; failed or unrun
   checks MUST be identified explicitly.
3. The live-model launch gate MUST use 40 consented person/garment pairs covering saree prints,
   intricate borders, pallu, fabrics, body shapes and lighting. At least 80% of all pairs MUST
   score at least 4/5 on each of identity preservation, garment fidelity and believable drape,
   with no severe artifact. Refusals and timeouts MUST count as failures. Human review,
   p50/p95 latency and cost per accepted image MUST be recorded. This is a required evaluation
   threshold, not an assertion that any candidate model has passed.
4. Performance evidence MUST declare its environment, 1,000 catalog products, 20 concurrent
   users and mobile-network profile. Warm ordinary API requests MUST meet p95 ≤ 750 ms,
   excluding media transfer and AI calls; browsing MUST become usable within three seconds.
   Cold starts MUST be measured separately. Generation MUST target p95 completion ≤ 90 seconds
   and reach a terminal state by 180 seconds under the documented demo load, exposing a clear
   failure when the deadline is exceeded.
5. Main customer and staff tasks MUST work from 360 px mobile width through desktop, with
   labelled controls, keyboard navigation, visible focus, accessible contrast, separate
   navigation/layouts and clear validation or unavailable-action explanations.
6. Demo evidence MUST show that seeding twice creates no duplicates and that cleanup dry-run
   results match deletion while preserving pre-existing records and objects. Mock verification
   and live-provider verification MUST be reported separately.
7. A deployed release MUST have smoke-test evidence for real provider access, private worker
   authorization, private media, quotas, backup/restore instructions and the customer-to-store
   journey. Operational metrics MUST include discovery-to-try-on rate, generation success,
   preview saves, callback requests, time to first staff action and AI cost per accepted result
   without private content.

## Governance

This constitution governs project specifications, plans, implementation and review. Supporting
requirements are in the [PRD](../../../docs/PRD.md), technical decisions in the
[architecture baseline](../../../docs/architecture.md), and feature sequencing and commands in
the [Spec Kit guide](../../../SPEC-KIT-GUIDE.md). The PRD and architecture document currently
live in the parent workspace's `docs/` directory; the guide lives at the workspace root.
Planning MUST consult these linked sources at their existing locations.

Every plan and change review MUST check applicable principles and acceptance evidence.
Conflicting requirements MUST be identified and resolved before affected implementation.
A change that alters a constitutional rule MUST be proposed as an explicit amendment with
its rationale, affected principles, privacy/cost impact, migration or compatibility work,
and acceptance evidence. The project owner or designated maintainer MUST approve the amendment
before implementation relies on it. Routine tuning of documented configurable defaults within
these rules MUST be recorded in configuration and its plan; changing a default stated here
also requires updating this document. Additional infrastructure or scope outside the baseline
requires an explicit approved amendment and corresponding PRD/architecture reconciliation.

Versions MUST follow semantic versioning: MAJOR for incompatible principle removals or
redefinitions, MINOR for added principles/sections or materially expanded guidance, and PATCH
for clarifications or wording fixes without changed obligations. Amendments MUST record the
version, ISO amendment date, affected rules and required follow-up. The original ratification
date MUST remain unchanged. Adoption of this previously unfilled scaffold establishes 1.0.0
on 2026-10-26. The temporary Sync Impact Report MUST be removed before committing the amendment.

**Version**: 1.0.0 | **Ratified**: 2026-10-26 | **Last Amended**: 2026-10-26
