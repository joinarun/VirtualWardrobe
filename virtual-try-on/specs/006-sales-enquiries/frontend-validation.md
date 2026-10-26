# Frontend sales enquiry verification

Implementation is confined to `apps/web`, following `contracts/api.md`.

## Implemented behavior

- Available product and preview-result callback links open a customer-only form. Name and unverified phone are read-only; versioned contact-sharing/retention consent precedes submission. Optional notes remain plain text. New/duplicate confirmations use the contract's distinct copy. No try-on job, private image or attachment is required or shared.
- Customer enquiry list/detail, status filter, persistent URLs and plain-text replies preserve public history across product changes. Closed requests explain why replies are disabled and offer a fresh callback path.
- Store workspace exposes selected-store new/unassigned and active counts, refreshed every 30 seconds while visible. Contact search always uses the CSRF-protected POST body, never a URL query string. Lists and detail GETs do not claim work.
- First opening of an eligible unassigned enquiry sends an explicit claim POST. The authoritative assignee is displayed; other viewers retain that winner. Global access does not make an account an eligible assignee. Store-scoped assignment/status/outcome/reopen controls label customer-visible reasons separately from internal assignment reasons.
- Public replies and internal-note forms are visibly separate. Staff chronology labels PUBLIC/INTERNAL visibility, actors, times, assignment/status transitions and outcomes; the customer receives only the server's public projection. Removed contact disables text/reopen controls and preserves redacted operational history for closure.
- SVG icons, responsive 360px layouts and measured contrast are preserved. Staff contact/case operations now precede the long history in DOM and mobile reading order; desktop places that same aside in its right grid column. Contact-summary links jump to public reply, internal note and history focus targets. The browser journey verifies DOM/visual priority and native keyboard focus movement into the note textarea.

## Actual checks

- First real enquiry browser journey passed in 16.7 seconds.
- Final required **`make e2e-clean`: 12/12 passed in 22.1 seconds**, executing the standard `make e2e` path with protected global operator setup and zero skips. The enquiry journey completed in 20.1 seconds in this parallel full run. It packaged the final 129-check/body-cap source in a separate build copy and used separate database/media/ports/fixtures. Log: ignored `work/virtualwardrobe-e2e-20261027032537-f9995e/verification.log`. The earlier shared standard run also passed 12/12 in 20.0 seconds.
- A later repeated shared-instance run hit its real 12-logins/10-minute operator limit on one identity test while the enquiry journey passed. No limit or credential was reset; the final isolated required run above supplied the clean full gate.
- Real callback journey covered explicit consent/read-only contact, duplicate request preservation, optional try-on, read-only GET/list, body-only phone search, automatic claim/winner, cross-store/customer/workforce denials, staff public reply/internal-note isolation, customer reply→CUSTOMER_REPLIED, reassignment, close/outcome, reopen/reassignment, chronological history, customer deletion and removal of every free-text body.
- The journey verified literal HTML-like input remains text, never markup. Mobile width checks and axe color-contrast checkpoints passed for callback, staff enquiry and customer conversation pages.
- Existing identity/recovery/scope, catalog/media, private try-on/gallery and public contrast journeys remain green. Tests use disposable accounts/stores and original owned media; no paid provider call or external notification occurs.
- TypeScript/production build, lint and diff whitespace checks pass. Backend V8/API shapes remained stable; backend 129-case evidence is recorded separately by the backend owner.

Reviewed ignored screenshot evidence: `work/e2e/customer-enquiry-mobile.png`, `staff-enquiry-mobile.png` (triage viewport), `staff-enquiry-operations-mobile.png` and `staff-enquiry-full-mobile.png`. Staff triage is visible before the history; the full capture retains the complete chronology. Fixtures/credentials and contact-search payloads are not embedded in this report.
