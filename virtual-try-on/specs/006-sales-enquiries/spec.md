# Feature Specification: Store callback enquiries

**Created**: 2026-10-27 · **Status**: Ready for planning
**Input**: Complete customer callback requests and scoped store follow-up with explicit claims, history and contact privacy.

## User Scenarios and Testing

### User Story 1 — Request a callback and follow replies (Priority P1)

A signed-in customer confirms their name/unverified phone, chosen product/store and separate contact-sharing consent, adds an optional note and requests a callback without needing a try-on. They return to My enquiries and exchange plain-text replies with the selected store.

**Independent test**: Repeated concurrent submissions create one active enquiry with immutable product/price/contact snapshot. The customer can read/reply to only their own enquiry and never sees internal notes or assignment history. Closed enquiries reject new replies.

### User Story 2 — Claim and manage store follow-up (Priority P1)

Accepted store staff/admins see new/unassigned and active counts, filter their store's enquiries, open details and explicitly claim unassigned work. Exactly one eligible employee wins concurrent claims. Authorized store employees can reassign to an eligible teammate, change status, close with an outcome or reopen with a reason and valid assignee. Public replies and internal notes remain distinct.

**Independent test**: GET/list/counts never claim. Simultaneous claim POSTs have one winner and preserve ordered history. Wrong-store/removed-member requests fail. Reassignment never crosses store membership boundaries. Visible counts refresh every 30 seconds while the page is visible.

### User Story 3 — Preserve useful history while removing personal details (Priority P1)

When access is revoked, the employee's active assignments return to the unassigned NEW queue with an audit event. Account deletion and closed-contact retention remove stored customer contact and all free-text history that may contain personal information, retaining non-identifying operational history.

**Independent test**: Revocation racing a claim or assignment leaves no ineligible assignee. Deleting a customer redacts contact, initial notes, public messages, internal notes and free-text reasons even while staff work is in flight. Closed enquiries are redacted after 180 days; redacted contact is never restored by reopening.

## Edge Cases

Duplicate click/refresh; archived or unavailable products; enquiry for a foreign store; stale membership/global-role snapshot while waiting for a lock; simultaneous claims/reopen/create; disabled or invited assignee; claim by global admin without store membership; closed replies; customer reply while awaited; membership removal/global disablement; account deletion during reply; retention while reopening; internal-note leakage; guessed identifiers; HTML-looking plain text and pagination bounds.

## Requirements

- FR-001 Callback creation requires authenticated customer ownership and separate versioned consent to share name, unverified phone, optional note and selected product with its store.
- FR-002 Allow at most one active enquiry per customer/product/store. Duplicate submission returns that enquiry without overwriting its snapshot or initial note; new requests are allowed after closure.
- FR-003 Preserve product title, SKU/reference, displayed INR price and store identity. New requests require a published available product in an active store and do not require a preview.
- FR-004 Customer list/detail/replies are owner-only; staff list/detail/counts/mutations enforce current store scope after locks. No global customer directory or customer-photo attachment exists. Staff contact search keeps names/phone fragments out of request URLs/logs.
- FR-005 GET/list/counts are read-only. Explicit claim is atomic, idempotent for its winner, and has exactly one eligible assignee under concurrency.
- FR-006 Assignees are enabled workforce users with accepted ACTIVE staff/admin memberships of the same store. A global administrator without such membership can manage/assign but cannot self-claim.
- FR-007 Enforce the PRD's NEW/OPEN/IN_PROGRESS/AWAITING_CUSTOMER_RESPONSE/CUSTOMER_REPLIED/CLOSED transitions. Closing requires an outcome; reopening requires a reason, valid assignee and no other active enquiry for that combination.
- FR-008 Record ordered actor/time history for creation, claims, reassignment, status, reopen, public replies and internal notes. Customers receive only public conversation/status events, never internal notes or assignment events.
- FR-009 Customer reply while AWAITING_CUSTOMER_RESPONSE moves to CUSTOMER_REPLIED; other active replies preserve state. Closed tickets reject customer/public replies; internal staff notes may document closed cases.
- FR-010 Loss of membership or enabled workforce access unassigns that user's active enquiries to NEW with history, including revocation/claim races. Preserve historical attribution.
- FR-011 Account deletion immediately redacts stored contact and every free-text enquiry event for that customer, while retaining non-identifying status/assignment history. Future staff text on redacted cases is refused.
- FR-012 Redact closed contact and free text after the configurable initial 180-day retention via authenticated maintenance. A longer future policy cannot extend an older consent retention promise. Redacted contact cannot be restored by reopening. Existing enquiries continue to open after product/store archival.
- FR-013 Responsive customer/staff views expose clear confirmation, errors, filters, assignees, history and contact-removal states. Visible store counts poll every 30 seconds; no external notification is sent.

## Success Criteria

- SC-001 A customer requests a callback independently of try-on, returns to their enquiry and receives a public store reply while internal notes remain hidden.
- SC-002 Direct API and concurrent checks prove active-enquiry uniqueness, one claim winner, eligible assignments, current store scope and read-only GET behavior.
- SC-003 Status/reopen/reply transitions, revocation and complete contact/free-text redaction have runnable evidence against real transactions.
- SC-004 Main tasks remain usable at 360 px and desktop, with clear empty/loading/error/contact-removed states and visible counts that refresh while active.

## Key Entities

Sales enquiry, immutable product/contact-sharing snapshot, append-only event with public/internal visibility, assignment and status/outcome history, contact-redaction marker.

## Assumptions and Clarifications

### Session2026-10-27

Routine choices follow PRD5 and existing scopes. Snapshot name/phone come from the authenticated customer and are confirmed read-only; phone is marked unverified. Duplicate submission never adds a second initial note. Global admins may operate across stores but may receive assignment only through an accepted active store membership. Account-deleted active enquiries retain non-identifying status/history for store closure; contact/message entry is disabled, and closed redacted cases cannot reopen. Public staff replies on closed cases also require reopening, while internal notes may document closure until contact redaction. No real-time chat, attachments, external messages or new notification infrastructure.
