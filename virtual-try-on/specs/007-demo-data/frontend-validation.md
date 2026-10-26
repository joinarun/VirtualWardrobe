# Frontend validation — feature007

Status: Complete. The final required disposable14-test suite passed with zero skips.

## Owned responsive assets

The three unchanged Latin variable WOFF2 files total114140bytes. `apps/web/public/fonts/manifest.json` records each original Google Fonts source URL, exact byte count and SHA256; both original SIL Open Font License1.1 files are distributed alongside them. The current files' lengths/hashes were independently checked against the manifest. `src/fonts.css` serves them from this origin with font-display:swap; index.html preloads only the two normal faces. No remote font import remains.

The original hero-emerald.png remains unchanged. The existing backend ImageProcessor produced these display derivatives without a new image-generation call:

| File | Dimensions | JPEG quality | Bytes | SHA256 |
|---|---|---|---|---|
| hero-emerald-small.jpg |640×427|0.84|63594|2b619e74373bc0832c8b31d3b28b50ea1cce31710740a4f20d488b0b8d83aac5|
| hero-emerald-large.jpg |1536×1024|0.92|349645|06c20d10f84640bd8a8f65eb19a792c013e703747d89b40beeab25ec799280e8|

The derivative process/reference/hash/dimensions/quality are recorded in public/demo/provenance.json. The shared editorial image uses a640px picture source on narrow screens plus desktop srcset/sizes, intrinsic dimensions and priority only for the storefront hero; the sign-in story loads lazily. A390px/DPR2 Chromium check loaded the63594byte derivative, observed no Google Fonts requests, confirmed font readiness, keyboard Skip to content focus and no horizontal page overflow.

## Presentation and accessibility

FIXTURE/EVALUATION_DEMO show a clear fictional stores/products/sample-contact warning and the current server-provided preview label/notice. LIVE hides this demo warning. Source-photo consent continues to use the detailed current server policy. No credentials or user directory enter public configuration/UI.

Small typography declarations formerly7–11px now have a12px floor; explicit form inputs use16px. Original editorial headings, SVG icons, colors and cream/plum layout remain. Customer/staff skip links move keyboard focus to the corresponding content region.

Browser journeys now run axe WCAG2 A/AA and WCAG2.1 A/AA rules rather than contrast alone. The first expanded exploratory run found actual label-content-name-mismatch issues in the staff enquiry counter and gallery preview badges; accessible names now include their visible count/mode. Unavailable product cards also include their visible availability label. An independent review also caught state/mode ordering in image-less recent-preview links; the accessible name now follows the visible state-then-mode order, with a queued-card axe checkpoint in the existing UI test. The repeated catalog/try-on/enquiry checks then passed6/6 in20.0s against the stable feature006 runtime (`work/e2e-007-a11y-fixes.log`). The final public layout/font/asset and current FIXTURE/EVALUATION_DEMO/LIVE disclosure checks passed2/2 in3.2s at390px/DPR2 (`work/e2e-007-public-final.log`). These were explicitly partial development runs, not the required seeded gate.

Automated rules do not prove complete accessibility conformance. Keyboard order, mobile overflow and screenshots complement those checks; human assistive-technology testing remains outside this automated evidence.

## Required generated-credential journey

The standard runner calls the reviewed standalone demo seed without repackaging or any provider invocation. It mounts generated JSON read-only, validates regular0600 inputs/schema/three users per role before bootstrap mutation, and fails actionably when inputs are missing. The required reporter continues to reject any skipped journey. The disposable clean runner gives the seed its own protected demo credential directory and a separate database/media project. Its environment explicitly overrides caller-exported demo paths/dataset IDs, so an inherited primary credential path cannot escape isolation.

The new browser journey reads generated credentials only into process memory, signs in as customer/staff/store admin/super admin, and verifies actual catalog image/video, explicitly labelled fixture gallery/generation/save, consented callback, staff claim/reply/status, customer reply and closure. It creates ordinary runtime activity rather than assigning it seed ownership; such references may correctly block later dataset-only cleanup. Cleanup proofs therefore use separate datasets/schemas, and make e2e-clean drops only its own disposable project.

The first required run passed13/14; the seeded end-to-end flow reached closure, then a later admin-read check timed out because a label nested around a select included its option text. The store selector now has the stable explicit accessible name Current store. The focused full seeded journey then passed1/1 in20.4s (`work/e2e-007-seeded-focus.log`), including all four role logins and all six seeded statuses across the three store lists. Its test-created preview is discarded in cleanup without changing the original seeded gallery.

The first disposable run passed13/14 and exposed a remaining spacing issue in the new queued-card checkpoint: adjacent DOM blocks concatenated QUEUED and Demo preview while the accessible name separated them. Explicit DOM whitespace and matching accessible-name word spacing fixed this; the focused queued/failure/gallery-error checkpoint passed1/1 in2.4s (`work/e2e-007-queued-a11y.log`).

## Checks

- `npm --prefix apps/web run lint`: passed.
- `npm --prefix apps/web run build`: passed; TypeScript and Vite production bundle,53modules.
- Explicit TypeScript check of all E2E/config files: passed.
- Licensed font/hero derivative SHA256 and byte verification: passed.
- `bash -n scripts/e2e.sh`: passed.
- Required malformed/missing seeded-credential negative check: failed actionably before journeys, with the protected operator fixture unchanged (`work/e2e-007-missing-demo.log`).
- Focused generated-credential end-to-end journey: passed1/1 in20.4s.
- Final required seeded disposable suite: **14/14 passed in29.6s, zero skips**. The generated-credential all-role workflow passed in27.4s. Evidence: `work/virtualwardrobe-e2e-20261027041134-61d93a/verification.log` and `result.json`.
- The final run intentionally inherited an invalid primary demo path/dataset option; its explicit isolated overrides still seeded the correct standard dataset. Both real primary credential files compared unchanged in process memory afterward. The isolated JSON/text/current-operator files are0600 and their directories0700. Result metadata confirms no application data or build target sharing; the run removed its own containers/database volume/network.
- Final screenshots: the same protected artifact directory’s `state/storefront-mobile-polish.png`, `state/seeded-storefront-mobile.png` and `state/seeded-staff-mobile.png`. The390px/DPR2 public viewport screenshot was visually inspected;360px functional flows also passed overflow and full automated accessibility checks.
- No paid provider call, cloud mutation, credential reset or Git commit was performed by this frontend verification.
