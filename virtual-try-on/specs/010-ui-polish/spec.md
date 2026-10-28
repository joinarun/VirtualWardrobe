# Feature Specification: Customer interface polish

Branch: `feat/10-ui-polish`. Date: 2026-10-28. Owner request: compact appearance control, clearer preview actions, aligned catalog controls and a complete desktop sign-in photograph.

## User stories and acceptance

1. As a shopper, I can change appearance through one small palette control on desktop and mobile. The four existing choices remain accessible by keyboard, persist across reloads and retain readable contrast.
2. As a shopper browsing sarees, I see a clean collection heading and aligned Filters / Newest first controls. Opening filters does not overlap results or move the sort control out of alignment.
3. As a customer viewing a preview, I find Save to my gallery (or Open saved gallery), Download preview and Discard this request (or Delete this preview) together as buttons. Destructive confirmation remains reachable. The preview omits request/expiry metadata and its purchase link reads Buy it.
4. As a desktop visitor signing in, I see the entire model and saree without crop or distortion.

## Functional requirements

- FR-001: Use the existing compact 44px palette control at every viewport, preserving its accessible Appearance name, focus and Pearl/Sage/Midnight/System choices.
- FR-002: Remove the dynamic pieces-to-discover line from the collection heading, including loading/fallback variants in that location.
- FR-003: Put the discard/delete control in the result action group with save/gallery and download. Preserve applicable state/ownership checks and explicit confirmation; retain a proper discard button for terminal requests without a result.
- FR-004: Remove Requested and Available until metadata from the preview page only. Retention and server expiry behavior remain unchanged.
- FR-005: Rename the preview's Request a store callback link to Buy it. It continues to open the existing enquiry form and does not create a payment or confirmed order.
- FR-006: Align the top and bottom of Filters and the sort select within 1px at 360/390/430px and desktop, both with filters open and closed. Preserve filter/search/sort behavior and no horizontal overflow.
- FR-007: Show the full owned editorial image on desktop sign-in, using its natural ratio without cropping or distortion; preserve the responsive sign-in form.
- FR-008: Preserve existing authentication, customer/staff separation, theme persistence, image privacy and data. Publish only the changed frontend to the existing GCP site, retain the verified backend, and push reviewed source to the existing GitHub repository.

## Success criteria

- SC-001: Focused Chromium and WebKit browser checks cover all seven requested changes, supported widths, keyboard use and automated accessibility.
- SC-002: Preview fixture tests cover saved/unsaved/terminal states and reachable confirmation without any live generation.
- SC-003: Build, lint, type/guard checks and required regression CI pass. Actual hosted public pages show the corrected controls and entire login image, with source provenance verified.
- SC-004: Frontend-only deployment retains backend revisions/image, private data, credentials and paid-action journal. No new generation, schema or infrastructure change.

## Clarifications and limits

No unresolved clarification. Buy it is a presentation change to the existing sales enquiry journey. Product counts in administrative screens and enquiry timestamps are outside this request. No new assets, provider changes or customer photo processing are needed.
