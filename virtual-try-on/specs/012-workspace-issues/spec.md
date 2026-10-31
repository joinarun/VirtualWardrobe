# Workspace issues from testing handover

Owner request2026-10-31: fix the four issues and two screenshots in issues to fix in virtualwardrobe.docx, publish existing app and commit/push GitHub. Source document is read-only; no unrelated instructions in it.

## Requirements and acceptance

- FR-001: Align Role and Membership state labels/select controls in Edit access across desktop and mobile. Membership acceptance guidance must not shift one control vertically. Maintain44px controls, readable themes and no overflow.
- FR-002: Provide keyboard/touch accessible Store status help in Store profile. Explain Pending hidden/preparation and accepted-admin requirement, Active public visibility, Archived hidden/prevents new customer requests/preserves history. Explain the current manual activation step truthfully; do not change activation domain behavior.
- FR-003: Remove the long Fictional demo/AI evaluation/fit disclaimer banner and its failed-loading fallback from every interface. Retain truthful internal provider/quality diagnostics and existing small Sample labels on seeded previews. No replacement consent/banner.
- FR-004: Saving one product successfully must allow editing another product without closing the editor manually. Preserve media editing/create-draft workflow, unsaved-change protection, in-flight mutation guards and error recovery. A failed save must not discard edits or incorrectly enable switching.
- FR-005: Publish reviewed/tested frontend to the existing GCP site and push source to existing GitHub. Preserve current accounts, memberships, stores/products, photos, jobs, spending ledger and credentials. No backend/schema/infrastructure change, reset, paid generation or new cloud test data.

## User stories

1. A store admin edits membership and understands store visibility: labels/controls align and status explanations work by keyboard/touch.
2. Workforce users use a clean workspace without the unwanted banner.
3. Staff edit product A, save it, then select product B immediately; dirty or busy editors retain safe guards and errors preserve user input.

## Success criteria

SC-001: Focused Chromium/WebKit tests verify all four fixes at360/390/767px and desktop, readable themes/AA, proper focus and no overflow.
SC-002: Product regression proves original failure and corrected sequential edits, held save and failure/dirty recovery without losing edits.
SC-003: Type/guards/lint/build/operator checks and complete required GitHub CI pass. Actual hosted source/assets and changed workspace controls are verified with read-only existing accounts.
SC-004: Backend revisions/image/schema and fresh aggregate data/credential/canonical journal evidence remain preserved across frontend-only release. No new provider request.

## Clarifications

No ambiguity. This request removes the banner everywhere including staff, extending the earlier customer-only cleanup. The prior discussion suggesting automatic activation was advice only and is not part of this document. The unrelated provider INVALID_RESPONSE investigation is not an issue in this attachment and is not claimed fixed here.
