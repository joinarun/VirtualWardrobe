# Feature Specification: Mobile customer experience and persistent sign-in

**Feature Branch**: `feat/09-mobile-experience`
**Created**: 2026-10-27
**Status**: Ready for implementation
**Input**: The owner requests login persistence after switching mobile apps/reload, a native-like mobile customer experience, theme choices, a simple saree→photo→preview flow without photo-consent checkboxes, warnings or generation/provider details, thorough UI testing, GCP deployment and GitHub delivery.

## User Scenarios & Testing

### User Story 1 — Return without signing in again (Priority: P1)
A signed-in customer switches to another app, returns, reloads or reopens the browser and resumes shopping or the existing preview.
**Independent Test**: Resume/reload/reopen an authenticated customer session, including temporary network loss, while checking that only explicit expiry/revocation ends it.
**Acceptance Scenarios**:
1. Given a valid customer login, switching apps and returning restores the current signed-in view without another login or duplicate preview.
2. Given a reopened browser, a persistent login remains valid within its documented lifetime.
3. Given a delayed old anonymous/unauthorized response after login, the newer authenticated state is retained.
4. Given transient network failure, the app offers reconnect/retry instead of claiming the customer signed out.
5. Given logout, password recovery/change, disablement or actual expiry, private access is revoked and sign-in is required.

### User Story 2 — A simple mobile try-on (Priority: P1)
The customer chooses a saree, adds a photo and views the generated preview using clear reachable controls.
**Independent Test**: Complete that journey on a 360px phone without consent checkboxes, provider/model/technique information or dense banners.
**Acceptance Scenarios**:
1. Product selection and photo choice lead to one clear preview action; photo processing requires no checkbox or technical acknowledgement.
2. Pending generation survives navigation/reload and returning to the app; completed preview supports save/download/delete.
3. Compact navigation and reachable controls work without horizontal overflow or overlap with the keyboard/home indicator.
4. Customer content contains no provider/model, deployment/evaluation/benchmark diagnostics or processing warnings; necessary file/network errors use concise actionable language.
5. Customer data stays private and other customers/workforce cannot access the photo/result.

### User Story 3 — Choose an appearance (Priority: P2)
The user selects Pearl, Sage, Midnight or System and the app keeps that choice across pages, reload and reopening.
**Independent Test**: Switch each theme, reload, change the system preference and inspect first paint, contrast and imagery.
**Acceptance Scenarios**:
1. Theme changes take effect without navigation and persist when storage is available.
2. System follows device light/dark preference; explicit choices override it.
3. Unavailable/corrupt preference storage does not block the app.
4. Text, forms, focus and staff workspace remain readable in every palette; garment image colours are unchanged.

### Edge Cases
- Mobile browser discards the document; authentication/current server job must recover, while a not-yet-uploaded local file may need reselection.
- Old session/config/CSRF replies arrive after sign-in, logout or account switch.
- Offline return, slow cold start, proxy errors and actual expired/revoked login are distinguished.
- Previously issued browser-session cookies may require one new sign-in after deployment.
- Legacy queued uploads retain their actual historical attestations; new actions cannot invent them.
- Small viewport, landscape, zoom, software keyboard, long titles and safe areas remain usable.
- Theme preference is unknown, unavailable or changed in another tab.

## Requirements

### Functional Requirements
- **FR-001**: Customer login MUST persist through app switches, document reload and browser reopening for up to 30 days, subject to server expiry and revocation.
- **FR-002**: Network/refresh failure MUST NOT assert logout; only a current authoritative result, explicit logout or actual expiry/revocation may clear authenticated state.
- **FR-003**: Older responses MUST NOT overwrite newer auth/CSRF state, and resume MUST refresh existing work without duplicate generation mutations.
- **FR-004**: Customer mobile screens MUST use compact navigation, safe-area-aware bottom navigation, reachable primary actions and at least 44px tap targets at 360px and wider.
- **FR-005**: The main customer path MUST be choose saree→add photo→view preview, with no blocking image-consent/age/ownership checkboxes or hidden fabricated attestations.
- **FR-006**: Customer screens MUST omit provider/model/technique, budget internals, deployment-mode/benchmark diagnostics and dense processing warnings; concise operational errors remain actionable.
- **FR-007**: A passive Privacy link MUST make photo handling/retention available outside the main try-on path; private storage, ownership, retention and spending controls remain enforced.
- **FR-008**: New photo requests MUST be recorded as explicit user actions with version/time, distinguishable from preserved legacy attestations; mixed/invalid request bases are rejected.
- **FR-009**: Pearl, Sage, Midnight and System MUST be selectable, persist only non-secret preferences, apply without first-paint flash and keep garment imagery unchanged.
- **FR-010**: Themes and navigation MUST preserve customer/staff keyboard access, readable contrast, accessible labels and responsive layouts at 360/390/430px and desktop.
- **FR-011**: Existing users/stores/products/photos/enquiries and previous queued requests MUST survive migration; workforce idle limits and absolute temporary-password expiry remain enforced.
- **FR-012**: Changes MUST be tested on local UI/backend and actual hosted mobile/session/theme flows, deployed into the existing GCP resources and pushed with passing code CI.

### Key Entities
- Persistent authenticated session: customer/workforce identity, expiry and revocation boundary.
- Processing action: user, product, request basis/version/time, private processing snapshot; optional historical attestations only for legacy records.
- Appearance preference: one of Pearl/Sage/Midnight/System, local non-secret preference.
- Existing preview: durable job and owner-only result; current progress resumes through read-only observation.

## Success Criteria

### Measurable Outcomes
- **SC-001**: Every scripted reload/reopen/resume case retains valid customer login; actual expiry/logout/revocation denies private access.
- **SC-002**: Every delayed-response/network test preserves the latest account state and creates no duplicate preview.
- **SC-003**: The customer completes the three-step try-on path with zero photo-attestation checkboxes and zero provider/model/benchmark/budget notices on customer screens.
- **SC-004**: All four appearances survive reload and first paint, meet automated contrast checks and preserve image colours.
- **SC-005**: Core screens have no horizontal overflow or clipped primary controls at 360/390/430px and desktop, including keyboard/landscape cases.
- **SC-006**: Required backend/browser/guard checks pass without unexpected skips; actual deployed source, session-cookie policy, themes and data preservation are recorded before delivery.

## Assumptions
- Customer sessions allow 30 days idle; workforce remains 8 hours idle, anonymous sessions 30 minutes, and temporary workforce credentials retain their 24-hour absolute expiry. Persistent browser cookies last up to 30 days.
- Existing f87 session cookies may need one sign-in to receive the new persistent cookie; no unsafe automatic session-ID rotation is introduced.
- The owner explicitly approves constitution v2.0.0; image-processing consent UI is replaced by deliberate request action. Account signup/recovery and separate callback-contact sharing otherwise retain their established security behavior.
- Mobile means a responsive web app with native-like interactions, not new Android/iOS binaries. No new infrastructure, offline photo cache or session-secret local storage is introduced.
- Provider provenance, quality gates and budgets remain operator/internal concerns. Human fidelity and statistical generation p95 remain separate production-promotion work.
