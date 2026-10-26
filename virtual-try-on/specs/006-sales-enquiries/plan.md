# Implementation Plan: Sales enquiries

**Date**: 2026-10-27 · **Spec**: [spec.md](spec.md)

## Summary and technical context

Extend the existing Java 21/Spring Boot/JDBC/PostgreSQL backend and React customer/staff interfaces. Flyway V7/V8 add sales enquiries and append-only operational events. A partial unique index enforces one non-CLOSED enquiry per customer/product/store. Product title/SKU/price/store and customer name/unverified phone are captured in snapshots; no preview/photo reference is accepted or exposed. Existing cookie/CSRF, identity and store membership services remain authoritative. No new infrastructure or external notifications. Shared security review also closes the provider whole-response timeout and caps non-raw mutation bodies at128KiB before JSON parsing, preserving raw media caps; combined regression includes those governing resource bounds.

## Constitution check

Pass: one backend/API/database, explicit contact consent, current server authorization, atomic claims and active uniqueness, no GET assignment, customer-only public history, no staff customer gallery, durable attribution and privacy redaction. Demo seeding and operational logging changes remain later features. Existing enquiries survive catalog/store archival; new requests require active available catalog.

## Lock and race design

Customer mutations first lock the customer's account row, then the administration guard, then store row and enquiry row. Staff mutations lock administration guard, re-read current workforce/global role, then store and enquiry. Staff operations NEVER lock the customer account; contact/assignee identity reads are nonlocking after the guard. This avoids owner/store inversion with account deletion. Membership events already occur under administration/store locks; handlers lock only affected enquiry rows in deterministic order. All app mutation paths use the same administration/store serialization; the partial unique index is a second invariant guard.

Account deletion runs under the existing account lock and acquires administration/store/enquiry locks in that order. If staff text commits first, deletion scrubs it; if deletion wins, later text is refused. No handler waits for a customer account while holding a store lock. Retention processes one candidate in its own short transaction, rechecking CLOSED and due age after locks; a reopened case cannot be scrubbed from a stale candidate. No storage/network I/O is added.

## Status, assignment and history

NEW is unassigned; claim or explicit assignment opens it. Claims are idempotent only for the current winner, with a409 for another assignee. Targets require enabled WORKFORCE and accepted ACTIVE store membership. Global admins without membership may manage but cannot be assignees. Public replies/status events and internal notes/assignment events are persisted separately by server-chosen visibility. Customer queries explicitly allow only public event types. All text is plain bounded text, never HTML or attachments. Staff contact search uses a read-only CSRF-protected POST body, keeping names/phone fragments out of request URL logs; GET q is product-only.

OPEN→IN_PROGRESS/AWAITING_CUSTOMER_RESPONSE/CLOSED; IN_PROGRESS→AWAITING_CUSTOMER_RESPONSE/CLOSED; AWAITING_CUSTOMER_RESPONSE→IN_PROGRESS/CLOSED; CUSTOMER_REPLIED→IN_PROGRESS/AWAITING_CUSTOMER_RESPONSE/CLOSED. A customer reply while awaited atomically becomes CUSTOMER_REPLIED. Close requires CONTACTED/CONVERTED/NOT_INTERESTED/UNREACHABLE; reopen is a distinct mutation requiring reason, eligible assignee, unredacted contact and no other active enquiry. Internal notes may annotate closed cases until redaction; public replies require an active case.

## Privacy and maintenance

Contact-sharing consent records version/notice/timestamp and promised retention days before creation. The version includes retention days; cleanup uses the shorter of current policy and that promise so later increases never extend older consent. Contact is snapshotted from the authenticated customer, not an arbitrary phone supplied by the browser. Redaction clears name/phone and EVERY event free-text body (initial notes, messages, internal notes and reasons), retaining enum transitions, actor IDs and timestamps. Customer-account deletion marks contact REMOVED_ACCOUNT; closed180-day retention marks EXPIRED. Redacted cases accept no future text or reopen and never recover contact from the account table. Public CONTACT_REDACTED events contain no body. The existing authenticated worker maintenance route and local worker loop call enquiry retention; no public maintenance endpoint.

## Ownership and acceptance

Backend owns spec/contracts, V7 schema, enquiry service/controllers, event hooks, retention integration and real PostgreSQL/HTTP tests. Frontend owns apps/web/e2e after frozen contract. Root's E2E runner changes are coordinated independently; no shared Maven writes during its bootstrap setup.

Test active-creation and claim races, wrong-store and stale/global-role checks, invited/disabled/foreign assignees, GET nonmutation, all state/reopen/reply rules, internal-history exclusion, membership/disablement versus assignment races, account deletion during text mutation, full free-text/contact redaction and retention/reopen races. Browser tests exercise customer callback→staff claim/public reply/internal note→customer reply→closure and unavailable/empty/error/360px views. Preserve all earlier identity/catalog/try-on tests and record evidence before convergence.
