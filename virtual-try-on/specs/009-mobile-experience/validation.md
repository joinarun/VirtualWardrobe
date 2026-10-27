# Feature 009 validation

## Source review and completed gates

- Owner request approved constitution 2.0.0 and the frozen session/photo/theme contract. All 12 functional requirements have task coverage; specification analysis found no blocking ambiguity.
- Backend full suite: 192 tests, zero failures/errors/skips, 1m 56s. Includes real HTTP/PostgreSQL persistent cookie/browser-cookiejar recreation, role idle intervals, expiry/revocation/disable/password/logout/CSRF and absolute temporary credential expiry; action-based photo requests, NULL legacy flags, old queued protocol and schema 10→11/old-writer migration compatibility. A final package also passed its six actual HTTP persistence tests. Local compatible worker then API restarted and reported readiness UP.
- Root reviewed additive migration 11 and session enforcement. New USER_ACTION rows never fabricate old attestations. Existing legacy cookies require one real login for persistent replacement; server idle and browser-cookie issuance expiry are distinct limits.
- Operator controlled suite: 43 tests passed, independently rerun by root in 1.914s. Existing worker canonical audience is reused during redeployment, first-creation two-stage behavior is preserved, malformed/foreign/changed URLs stop publication. Session environment values/cost bounds are explicit.
- Hosted mobile runner guard suite: 2 tests passed; default operation is offline/credential-free and generation/upload/product mutations are denied. Combined hosted controlled guards: 20 tests passed. The new runner has not yet been dispatched against deployed 009.
- Theme module/pre-paint source gate: scoped TypeScript/lint passed; 13 controlled cases covered OS/cross-tab preferences, invalid values, unavailable reads/writes, listener cleanup and head ordering. Static palette contrast checks passed 14 text/surface pairs per palette (minimum ratios: Pearl 5.507, Sage 4.850, Midnight 6.530). Actual DOM accessibility remains a separate pending browser gate.

## Visual review and controlled UI checks

Root inspected the actual local 390-pixel catalog and photo screens. Two usability issues were found and corrected: products initially started at y721 and photo actions were below the fold behind a sticky disabled button. The compact layout starts the first product row at y506, places filters beside sorting, and puts photo/camera controls above the photo placeholder. The initial create action stays in normal flow; choosing a photo makes it reachable above the bottom navigation. Pearl and Midnight screenshots were visually reviewed, with product image colours preserved. Selected-photo framing uses contain rather than cropping the body.

Protected local evidence is under `work/009-visuals/`; it uses public owned product assets and an explicitly mocked photo/account fixture, with no source upload authorization or model call. Separate controlled preview UI checks passed three cases in 4.6 seconds: queued cancellation/unknown outcome/gallery capacity with accessibility, no automatic upload/current action version, and a create-stage conflict followed only by an explicit fresh request.

Independent auth review found an unbounded session401 revalidation loop and staff account switches retaining scoped component state. The implementation excludes session reads from business401 events and keys each workforce workspace by account identity. It also rejects malformed successful session bodies rather than treating them as confirmed guests. Full deterministic browser proof is still pending below.

## Browser engine and accessibility validation

- All 21 targeted WebKit 26.0 cases passed across targeted runs: eight authentication races/reconnect/authority cases, one stalled-read/job-resume case and twelve mobile/theme cases. The four theme checks include 16 customer/staff WCAG A/AA scans. Five layouts cover 360, 390, 430, landscape 844 and desktop 1280. Storage failure, cross-tab/system preference changes, keyboard selection, 44-pixel controls, no horizontal overflow, selected-photo action separation, unfiltered product images and checkbox-free customer content are covered.
- Actual testing found staff sidebar foregrounds with insufficient contrast (1.09–1.76:1). Explicit accent/inverse tokens fixed this; the final four theme accessibility checks passed in both Chromium and WebKit. Assertions were not relaxed.
- The pre-React test proves theme attributes, root background and empty React content while the application module is deliberately held. Its optional screenshot initially waited for document/fonts while that same module was held. Pixel capture was moved after release, with all pre-React assertions preserved. The final capture-enabled case passed in Chromium (2.7 seconds) and WebKit (3.5 seconds). Initialized screenshots do not claim to be pre-React pixels.
- Root visually inspected the 390-pixel Pearl/Midnight catalog/photo screens and final WebKit 360-pixel selected-photo, 430-pixel result, landscape 844 photo, desktop 1280 catalog and Sage staff screens. No remaining visual blocker was found. Fixture screenshots contain only owned synthetic assets and masked account fields.
- The first fresh required Chromium run passed 36 of 37 cases with zero skips; its sole failure was the optional screenshot dependency above. The final fresh required run with the corrected capture mechanism passed all 37 tests in 36.3 seconds with zero skips, plus all seven runner/security checks; isolated cleanup exited successfully. Evidence: `work/virtualwardrobe-e2e-20261028011100-99fa43/`. TypeScript, production build, lint and all 20 hosted guard tests passed. No backend code changed after the 192-test backend gate.

## Preservation and source checkpoint

The fresh read-only GCP preflight passed nine checks. Its baseline includes real activity after the earlier release: six jobs, three started/accepted provider attempts, USD0.75 committed, four saved outputs and 103 live objects. These records, all accounts, credentials and the original paid-action journal must be preserved. Hosted screenshots mask all private result/gallery images. No new generation or upload is part of this release smoke.

A source/working-tree credential scan checked 556 reachable blobs and 413 working files against 47 actual protected credential/recovery values and token/key patterns; no match was found. Generated credentials, user photos and private receipts remain ignored. The reviewed source is being committed as the deployment/CI checkpoint; deployment evidence will identify its exact SHA.

## Pending release gates

Clean source checkpoint, pre-V11 cloud backup, actual 009 deployment and read-only hosted mobile verification, GitHub code CI and final convergence remain pending. Prepared test plans are not deployment evidence. No new model request has been made for 009; the prior paid-action journal must remain unchanged.

Desktop mobile emulation is not physical iOS/Android device evidence. A real phone app-switch/lock/reopen check remains a user-device follow-up unless actual device access becomes available.
