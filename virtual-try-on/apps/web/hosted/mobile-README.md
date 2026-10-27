# Hosted mobile release verification

`mobile-verify.mjs` is the feature 009 release smoke. Its default is an offline plan:

```sh
node apps/web/hosted/mobile-verify.mjs
node --test apps/web/hosted/mobile-verify.test.mjs
```

After the reviewed source is deployed, the release owner can dispatch:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node apps/web/hosted/mobile-verify.mjs --run
```

The executable override is optional when the pinned Playwright Chromium is installed.
The target is fixed to the existing VirtualWardrobe GCP project and Hosting origin.
Inventory and generated cloud credentials must be regular protected files. Debug,
trace and HAR environment controls fail before credential reads or browser launch.

The runner signs in with existing customer and staff fixtures. It closes and
relaunches an actual Chromium process using the same temporary owner-only profile,
then verifies that the expected account survives. It inspects cookie attributes
without recording the cookie value and verifies explicit logout. Role-specific
server expiry and revocation are covered independently by backend HTTP tests.

Customer screens are checked at 360, 390, 430, landscape 844 and desktop 1280 pixels.
Pearl, Sage, Midnight and System are tested with reload and accessibility scans;
the staff workspace is checked in all three explicit palettes. Photo controls must
be present without consent checkboxes or provider/model/benchmark copy. Mobile
navigation must have at least 44-pixel targets, and pages must not overflow.

No photo is selected or uploaded, and no preview, callback or catalog mutation is
requested. A browser route guard aborts every API mutation except sign-in/sign-out.
Existing customer jobs/gallery and the original paid-action journal must remain
unchanged. Independent GCP before/after aggregate accounting provides the separate
server-side check for additional jobs, source uploads or provider attempts.

Receipts and masked screenshots are written under ignored owner-only
`work/gcp/mobile-verification-*` directories with 0600 files. No passwords, cookies,
contact details, signed URLs, raw exceptions or exported browser state are printed.
The temporary browser profile is deleted in `finally`. Prepared commands are not
evidence of execution; actual results belong in feature 009's validation record.

Desktop emulation does not establish behavior on physical iOS or Android hardware.
No new model-quality or generation-latency claim is made by this UI/session smoke.
