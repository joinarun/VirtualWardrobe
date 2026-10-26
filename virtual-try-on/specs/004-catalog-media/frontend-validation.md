# Frontend catalog and media verification

Implementation is confined to `apps/web`; the backend contract is `contracts/api.md`.

## Implemented behavior

- Responsive customer discovery with actual API products, query/category/store/brand/label/price filters, sorting, pagination, explicit loading/error/empty states and browser-back restoration. No sample products are synthesized by the client.
- Product image/video detail gallery with publication and availability notices. Virtual try-on and callback actions are explicitly unavailable until their feature contracts are implemented.
- Store-scoped product draft/edit/publish/archive, brand selection, normalized labels, sequential upload/validation progress, image/video count checks, ordering, cover/reference selection and removal. The final published image cannot be removed through the UI.
- Super-admin category hierarchy/global brands, scoped store brands, and reusable target-specific store/brand logo uploads. Invited workforce memberships expose no catalog management controls.
- Raw upload capabilities receive only server-issued headers; cloud requests receive no CSRF token or cross-origin session cookies. Finalization uses the normal authenticated/CSRF-protected client and retries a transient decoder-capacity response once using the existing upload ID.
- Cards use backend optimized thumbnail URLs with lazy loading. The only static storefront image is the original, provenance-recorded editorial hero.

## Completed checks

- `npm --prefix apps/web run build`: TypeScript and production bundle passed.
- `npm --prefix apps/web run lint`: clean.
- Playwright discovery succeeds for the catalog and existing foundation/identity tests.
- Desktop visual inspection in Chrome and captured populated mobile screens confirm the editorial layout and full-body saree framing. Mobile cards use larger text; filters start collapsed for phone visitors.

## Browser acceptance run

The real-backend Playwright run passed **7/7 tests in 10.9 seconds** (catalog journey 9.6 seconds). Log: ignored `work/e2e-004-verified.log`. The real-service journey covered store/global/store-brand logos, hierarchical categories, staff draft creation, actual invalid-content rejection, two original PNG images and a genuine two-second MP4, cover/reference/order changes, publication/public visibility, derivative content/size, discovery filters, thirteen-record pagination, gallery/video metadata, 360px layouts, final-image protection, unavailable/archive behavior and identity regressions. A separate clearly labeled UI-only test injected one 503 response and verified recovery through the real service. Foundation and identity journeys also passed, including staff draft creation and scope controls.

The first runs exposed exact-label ambiguity in native selects; controls now have stable accessible names. Static review additionally fixed archiving during an open editor, changing metadata during a pending save, and a stale profile-logo PATCH that could overwrite a finalized upload.

Captured local evidence in ignored `work/e2e/`: `catalog-desktop.png`, `catalog-mobile.png`, `product-detail-mobile.png`, and `staff-product-editor-mobile.png`. Screenshots use disposable records and original owned media. Offscreen card images remain lazy-loaded.

The final run used the rebuilt backend with all 53 backend checks passing, including permission-race and compressed PNG metadata boundaries. It also verified that phone filters start collapsed and can be expanded. Build, lint and `git diff --check` passed on the final frontend source.

The privileged run reads an operator-provided credential file from an ignored owner-only directory; no credentials or signed upload capabilities are recorded in this evidence.
