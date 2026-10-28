# Validation: Customer interface polish

Status: implementation and verification in progress. No release success claimed yet.

Evidence will distinguish controlled public/preview fixtures from actual hosted verification. No new paid generation, customer image export or private data mutation is required.

## Public UI fixtures

Seven focused `e2e/ui-polish.spec.ts` cases passed on actual host Chromium156 (14.6s) and WebKit26 (9.2s), zero skips. They cover compact44px palette/keyboard/four preferences, no discovery count, filter/sort top+bottom alignment with filters open/closed at360/390/430/1280px, and the complete natural-ratio sign-in image at1024/1280/1440px. Automated WCAG A/AA scans reported zero violations. A separate fixture probe covered620/767/768/900/1024px and real sort navigation with zero overflow, JavaScript errors or attempted API mutations. Private local evidence: `work/010-ui-review/`.

TypeScript/21 hosted guard tests, lint and production build passed. Root independently inspected the1280px sign-in and390px catalog screenshots: entire head-to-hem saree image visible; palette compact; both catalog controls aligned. These are local controlled UI checks, not yet hosted release evidence.

## Preview fixtures and source gate

The new preview fixture acceptance case initially failed against the old text-only action, then passed after implementation. Final source passed Chromium16.1s and WebKit12.7s at360/390/430/620/767/1280px for saved and unsaved results plus a terminal request. It verifies three grouped44px actions, correct download/Buy it destinations, absent dates, no horizontal overflow, full-viewport destructive confirmation, a successful trial click and focus restoration after Keep request. No destructive request or model call is made. Four UI-only try-on cases passed together on Chromium13.4s and WebKit11.3s. An earlier WebKit batch aborted at browser.newContext before page creation; its individual queued case passed2.9s and the subsequent clean four-case batch passed. No skipped case is counted as passing.

Root reviewed Preview.tsx/tryon.css and owned-fixture mobile/desktop/action/confirmation screenshots. Existing server mutations, owner authorization and callbacks are unchanged. The mobile two-row toolbar uses the same767px breakpoint as the shell. Final TypeScript/21 guards, lint and production build pass; output assets include CSS BfWxhsP3 and JS CHlhLOv6.

The complete operator suite passed55/55 (root independently reran it). Negative tests cover dirty/moved source, backend/config changes, missing/unsafe/foreign inventory, runtime/traffic/Hosting drift and absent site/CAPTCHA. Publication cannot provision resources or deploy a backend. A fresh read-only live preflight matched the existing backend/site/CAPTCHA. Schema11 and existing user data remain; the fresh baseline has7 jobs/4 Google provider starts,4 saved previews and103 live objects. This differs from feature009's historical baseline because a user created a further job before feature010. Credentials, canonical paid journal and unrelated StyleReel are unchanged.

`git diff --check` passed. Precommit secret scan found zero matching protected values or token/key patterns across419 nonignored working files and643 reachable blobs. The scan must be repeated on the final committed source. Full required CI and actual publication remain pending at this source gate.
