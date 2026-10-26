# Identity and store frontend acceptance evidence

Verified 27 October 2026 against the actual local Spring Boot API, PostgreSQL and versioned-session runtime. The UI uses the frozen contracts in contracts/api.md. No catalog, try-on jobs, gallery or enquiry functionality is claimed by this feature.

## Implementation

- React customer/workforce sign-in, customer signup and account recovery, one-time code display/download, password rotation gate, account details/unverified-phone notice and customer deletion.
- Cookie-authenticated same-origin API client with CSRF tokens held only in module memory. Authentication mutations refresh the token. A declared CSRF_INVALID response permits one refresh/retry. Authentication/private fetches request no-store; browser localStorage is not used.
- Signup reads the server auth configuration. Real CAPTCHA mode loads and executes Google's enterprise client with the configured public key/action; missing/disabled configuration blocks signup. The local development adapter is explicitly labelled and cannot be inferred as a deployed fallback.
- Scoped store selector, profile editing, lifecycle changes, invitations, membership add/edit/remove and visible server conflict errors. Store staff do not receive membership-administration navigation.
- Super-admin workforce provisioning, enable/disable, global-role changes and workforce-only password reset controls. Own password reset directs the operator to Change password. Temporary credentials remain in component memory and survive list refreshes; they disappear when dismissed or the view is left.
- Separate responsive cream/plum customer and workforce layouts. The original generated hero asset and its correct crop/alternative text are used. Loading, empty, error, retry and confirmation states are explicit.

## Verification results

| Check | Result |
| --- | --- |
| npm run build | PASS: TypeScript project compilation and production Vite bundle. |
| npm run lint | PASS: no warnings or errors. |
| Browser layout/API smoke | PASS: customer/staff separation, 360px layout, liveness and API internal-route denial. |
| Real customer browser journey | PASS: local-mode signup, explicit privacy/test-adapter consent, one-time recovery codes and download, account/unverified phone, logout, code recovery, new-password login and disposable account deletion. HttpOnly/SameSite session-cookie properties and no localStorage were asserted. |
| Real workforce browser journey | PASS: temporary-password rotation, pending-store creation, existing-account admin invitation and acceptance, activation, final-admin rejection visible to the operator, new staff temporary credential, rotation, acceptance, staff-only navigation, mobile layout, removal and store archival. |
| Controlled UI configuration test | PASS: disabled signup hides submission and never renders the local test adapter. This is a UI-only mock of the config response, not evidence of live Google CAPTCHA verification. |

Final run: **5 passed in 16.3 seconds**, no skipped tests. Both actual account journeys used the real backend. The workforce test received only an explicitly mounted local bootstrap fixture and an ignored state directory; no credentials are embedded in tests or printed in their output.

The local operator's password was rotated by the first-login journey. Its current value is stored only in ignored work/e2e/admin-credential.json with0600permissions, for reproducible local verification. The original bootstrap temporary password file is stale after rotation. Do not publish either file. The real CAPTCHA assessment in GCP remains a separate deployment check.

Initial failures identified an API guard status mismatch and a decorative arrow included in a button's accessible name. The backend now returns404 for API-mode internal paths and decorative arrows are hidden from accessible names; the final rerun passed.

## Reproduce

Start the updated stack with make dev, build the e2e image, and run apps/web/e2e through the Compose e2e service. To include the privileged workforce journey, mount the operator-provided owner-only bootstrap file read-only, mount a dedicated ignored test-state directory, and set TEST_BOOTSTRAP_FILE and TEST_STATE_DIRECTORY to those container paths. The test can reuse its securely stored rotated credential on later runs. Without that fixture, the privileged journey explicitly skips; do not describe a skipped run as full verification.

The browser dependency layer is independent of application source, so later UI edits do not reinstall Chromium. No cloud resource changes or Git commits were made by this frontend feature.
