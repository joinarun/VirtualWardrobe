# Frontend private try-on and gallery verification

Implementation is confined to `apps/web`; the frozen API contract is `contracts/api.md`.

## Implemented customer flow

- Customer-only `/try-on?product={id}`, `/account/previews`, `/account/previews/{id}`, and `/account/gallery`. Sign-in/signup retain only an allowlisted same-origin return path. Account switches unmount private views and revoke local photo object URLs.
- Provider/model/location, fixture/evaluation/live label, current consent notice, retention and allowance come from the server before upload. Adults affirm their own single-person photo and provider processing. Choosing a different photo or receiving a new disclosure version requires renewed consent.
- JPEG/PNG source selection, camera capture where supported, local-only preview, actual raw-upload progress, authenticated validation and same-key retry of an ambiguous create response. Replacing/discarding an unused upload calls its owner-only deletion endpoint. Incomplete raw-upload retries remove the prior unused reservation.
- Persistent real-state request pages poll about every three seconds, back off after errors, pause while hidden, stop at terminal states and continue polling a pending save. They show no fabricated generation percentage. Cancellation, explicit save, same-origin attachment download and discard display authoritative responses.
- Saved gallery survives sign-out and product archival, reports capacity, supports deletion and distinguishes local fixtures from actual generated evaluation/live results. Unknown provider outcomes explain that no automatic retry occurred and require deliberate fresh upload when retry is allowed.
- Product try-on links are functional; callback remains visibly unavailable until feature006. Source images have no read route. Browser storage contains no session credentials, photos or capability URLs.

## Checks on the final V6 runtime

- `npm --prefix apps/web run build`: TypeScript and production bundle passed.
- `npm --prefix apps/web run lint`: clean.
- Full Playwright suite: **11/11 passed in 25.5 seconds**, using two workers. Log: ignored `work/e2e-005-verified.log`.
- The real local fixture journey passed in 9.9 seconds: consent before network, corrupt source rejection without allowance use, unused-source replacement, persistent job return, duplicate intent without double charge, no source read route, foreign/workforce/anonymous private 404s, real attachment download, explicit save, sign-in return to gallery, product-archive persistence, deletion/access denial and 360px layout.
- Four tests are explicitly labelled UI-only and inject controlled responses: signup configuration, catalog service recovery, cancellation/unknown outcome/gallery-capacity messages, and photo/disclosure consent renewal plus exhausted allowance. They are not claimed as backend fault or paid-provider evidence.
- Existing foundation, account/recovery, staff/store-scope and full catalog/media journeys remain green. No paid provider calls were made; the real local result is labelled Demo preview and is a deterministic fixture.

## Visual and contrast review

Decorative arrows, sparkle, lock and media controls now use tiny inline SVGs across customer/catalog/staff screens, avoiding missing glyph boxes on Linux Chromium. Existing test-sensitive accessible labels remain stable.

Light-surface foregrounds retain their original hues and meet a 4.8:1 target against the darker cream reference `#e9dcc8`. Examples: `#a08791` became `#6a5960` (2.44→4.84), `#b096a2` became `#685860` (2.01→4.93), green status text became `#57614b` (4.83), and brown mode labels became `#75583e` (4.82). Light sidebar text is preserved; its faint deferred label was lightened. The editorial photo caption has a dark backdrop.

Pinned `@axe-core/playwright` 4.14.0 found no `color-contrast` violations on rendered storefront, customer/staff login, signup, populated catalog, store product editor, try-on consent form, completed private result and saved gallery. This is a targeted contrast check, not a claim of complete WCAG conformance. Font self-hosting and broader accessibility/performance polish remain feature007 work.

Reviewed screenshots are in ignored `work/e2e/`: `private-preview-mobile.png`, `private-gallery-mobile.png`, `catalog-desktop.png`, `catalog-mobile.png`, and `staff-product-editor-mobile.png`. They contain disposable records and original owned imagery. Privileged browser fixtures are read in-process from owner-only ignored files; credentials and upload capabilities are not included in this evidence.
