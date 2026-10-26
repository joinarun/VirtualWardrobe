# Feature Specification: Repeatable owned demo data

**Created**: 2026-10-27 · **Status**: Ready for planning
**Input**: Provide a complete fictional demo, private generated credentials, safe targeted cleanup and a separate performance dataset.

## User Scenarios and Testing

### User Story1 — Start a complete fictional demo (Priority P1)

An operator seeds an owned dataset, signs in at each role and demonstrates discovery, fixture gallery and sales enquiries. The dataset includes at least3 super admins,3 store admins,3 staff,3 customers,3 active stores and30 products, including at least24 sarees, multi-image products, one owned video and all enquiry states/history. Some users span stores and others remain limited.

**Independent test**: Seeding twice creates no duplicate users/products/events/objects and preserves generated credentials. Seeded credentials enable actual browser journeys. Fixture previews are labelled Demo preview and never claim real provider generation or quality approval.

### User Story2 — Recover partial work and clean safely (Priority P1)

A failed or interrupted seed can resume without resetting accounts or publishing a partial catalog. Cleanup first previews its exact scope and refuses unsafe incoming references from unrelated data. Execution removes only its dataset and owned objects, preserving the bootstrap account and unrelated users/stores/products/activity.

**Independent test**: An injected object-storage failure leaves a hidden resumable dataset with tracked objects and the same owner-only credentials. Resume activates the complete dataset atomically. Cleanup dry-run matches execution, unrelated records/objects survive, incoming outside references block all initial cleanup mutation, and cleanup failure can resume.

### User Story3 — Prepare a reproducible performance catalog (Priority P2)

An operator creates a separate load dataset with1000 published products, measures browsing and removes it without disturbing the main demo. Shared prepared image bytes may be cached, but each product/media has unique owned physical keys so deleting one cannot break another.

**Independent test**: The load dataset has its requested published product count and unique object ownership; cleanup removes it while the main30-product demo remains.

## Requirements

- FR-001 Standard dataset contains at least3 users per role,3 stores,30 products with at least24 sarees, multi-store/limited memberships, multi-image/video examples and every enquiry status with assignment/message history.
- FR-002 Every seeded business record, child/recovery/attempt/event and storage object has explicit dataset ownership. Owned/generated/licensed asset provenance is retained; no retailer scraping or default paid AI call.
- FR-003 Fixture gallery records explicitly identify mock provider/Demo preview; no production quality approval or real generated-result claim is created.
- FR-004 Generate unique credentials/recovery codes once, hash credentials in the database and write only ignored owner-only local JSON/text files. Never print secrets or reset unrelated/previous accounts during repeat seed/resume.
- FR-005 Repeated seed with the same definition is idempotent; changed definitions or real identifier collisions refuse safely. Preserve bootstrap and unrelated records.
- FR-006 Persist ownership/staging before external writes, keep partial data unavailable to normal browsing/login, resume partial failures and activate complete data atomically.
- FR-007 Cleanup defaults to dry run, lists safe aggregate counts, refuses unsafe incoming cross-dataset references including object-key sharing, and deletes only its dataset after explicit execution.
- FR-008 Cleanup handles partial storage/database failure durably and remains idempotent. No public seed/cleanup endpoint exists and production demo mutation is refused.
- FR-009 A separate optional load dataset supplies1000 published products with unique media keys and cached normalized asset preparation; its cleanup preserves the standard demo.
- FR-010 Operator commands support local and explicitly targeted cloud storage/database environments without public listeners, background worker/provider invocation or secret output.
- FR-011 Responsive demo presentation uses optimized owned media, clear fictional-contact/evaluation labels, accessible fonts/icons/contrast and a required browser journey using the generated seeded credentials.

## Success Criteria

- SC-001 Standard seeding meets all role/store/catalog/history minima and enables customer/staff browser demonstration without paid calls.
- SC-002 A second seed produces identical record/object counts and unchanged credentials.
- SC-003 Failure/resume, dry-run/executed cleanup, unsafe-reference refusal, production refusal and unrelated/bootstrap preservation have actual transactional evidence.
- SC-004 A separate1000-product catalog can be created and removed independently with no shared physical media keys.
- SC-005 No credentials appear in repository/stdout/logs, and a fresh operator can execute the documented CLI flow.

## Key Entities

Dataset lifecycle/lease/fingerprint, owned object manifest, generated credential bundle, seeded roles/memberships/catalog/gallery/enquiry history and optional load profile.

## Assumptions and Clarifications

### Session2026-10-27

Use existing original synthetic adult/saree assets and provenance; video is locally derived from an owned still and clearly a demo sample. Normal demo users may start with already-rotated credentials, while ordinary workforce onboarding remains unchanged. Standard and load datasets are separate. Runtime visitor activity remains unrelated by default and can safely block cleanup rather than being silently adopted/deleted. Dataset leases expire so abandoned operations can resume; existing missing credential files never trigger implicit password resets. Root owns cloud execution; development verification makes no paid provider calls.
