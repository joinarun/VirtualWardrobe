# Feature 009 release plan

This is source preparation, not evidence of a new deployment. The current hosted
application remains source `f87c8f1`. Build, backup, deployment and hosted test
execution require the separate release instruction after source/tests are committed.
Use only project `virtualtryon-511016`, region `asia-south1` and the existing owned
resources. Preserve StyleReel and the default Hosting site.

## Session contract

| Setting | Reviewed value |
| --- | --- |
| `APP_SESSION_CUSTOMER_SECONDS` | `2592000` — 30 days idle for new customer sessions |
| `APP_SESSION_WORKFORCE_SECONDS` | `28800` — 8 hours idle |
| `APP_SESSION_ANONYMOUS_SECONDS` | `1800` — 30 minutes idle |
| Browser cookie | `__session`, up to 30 days, Secure/HttpOnly/SameSite=Lax, path `/` |

The serializer derives its lifetime from the authenticated upper bound. Server
role limits, temporary credential expiry and revocation remain authoritative.
Existing f87 sessions retain their old interval and browser-session cookie until
one new sign-in/session rotation obtains persistence. Do not claim that merely
changing configuration upgrades every existing cookie. A browser cookie's expiry
from issuance and a server inactivity interval are separate limits.

The operator config explicitly supplies these properties to API and worker. The
worker remains stateless. Deployment guards reject session values below 60 seconds,
non-integers or values above each reviewed role limit.

## Source checks and rollout

1. Finish the feature's PostgreSQL, session/security, mobile, theme and required
   browser checks. Commit the reviewed source. The deployment still refuses a
   dirty tracked/non-ignored tree or an image tag that does not identify HEAD.
2. At release authorization, capture current safe aggregate data counts, ready
   revisions, immutable image digests and the dedicated Hosting version. Preserve
   credential-file permissions/digests and the existing paid-action journal's
   bytes/hash; do not reset users, seed again or replace that journal.
3. If V11 ships, take a fresh named on-demand backup of the existing source before
   its migration. Validate the reviewed schema-10-to-11 path and legacy records;
   do not run an unnecessary second restore or overwrite the live database.
4. Build one Linux/amd64 image from the clean source. Deploy the V11-compatible
   worker first using its canonical URL captured from the owned service. Existing
   deployments never publish an empty worker audience. Only first creation uses
   the two-stage URL bootstrap. An unexpected canonical URL stops API/Hosting
   publication rather than changing queue destinations silently.
5. Deploy the API using that same image/worker URL, retain authenticated queue and
   maintenance delivery, and publish the dedicated Hosting release with its API
   pin. Record the full new source SHA, both ready revisions and matching resolved
   image digests. Keep quotas, costs, instance/pool limits and identities unchanged.
6. Run the seven generic read-only smoke checks and the feature-specific browser
   checks below. Compare current data/credentials/journal to the pre-release
   snapshot. Update evidence only from real results, then push the source and
   observe CI. No new model job is authorized by this plan.

Controlled source tests cover explicit role settings, bounds, initial worker
bootstrap, reuse of the owned canonical URL, foreign/malformed metadata and a URL
change before API/Hosting publication. Source preparation passed 20 deployment
checks and 9 private seed-wrapper checks without cloud access.

## Targeted hosted checks without AI generation

Foundation owns the updated `apps/web/hosted` runner. Use protected fixtures and
the existing exact Hosting origin. Reports must contain booleans, times and safe
aggregate IDs/counts, not cookie values, passwords, contact details or signed URLs.

- New customer and workforce sign-ins: inspect only cookie name/attributes/expiry;
  prove reload and a real browser close/reopen with the same private test profile
  retain the expected identity. Verify logout ends that session and clears the
  cookie. Existing backend tests must cover the shorter workforce/anonymous idle
  limits, temporary credential expiry and session revocation without waiting days.
- Background/return and offline/online: coalesced read-only session recovery must
  restore the existing account. A transport failure/non-200 must remain unknown,
  not become a confirmed guest. A real `{user:null}` response must become guest.
  Stale session/CSRF responses must not undo logout or an account switch. Resume
  must never replay a generation mutation.
- At 360px and 390px: check no horizontal overflow, reachable 44px actions,
  safe-area bottom navigation, inputs and sticky actions. Verify Collection,
  Previews, Saved, Account and the separate staff workspace.
- Pearl/Sage/Midnight/System: choose each, reload/reopen, check first-paint theme,
  system changes, cross-tab propagation, keyboard focus, readable customer/staff
  surfaces and an unchanged product-image appearance. Only the validated theme
  enum may enter preference storage; no auth/private photo cache is introduced.
- Customer content: verify checkbox-free photo UI, passive Privacy view and the
  absence of provider/model/deployment/benchmark banners. Keep operator provenance
  and quality gates intact. Use existing sample gallery content; do not submit a
  create-job request. The new `USER_ACTION` capture and legacy compatibility need
  actual PostgreSQL/API evidence in the backend suite.

A desktop browser's viewport/visibility simulation is not a physical phone test.
The separate manual check is: on an actual phone sign in, open Saved, switch to
another app, return, lock/unlock, reopen the browser and confirm identity, theme,
navigation and no duplicate generation. Record device/browser and observed result;
leave it unrun if no device evidence exists. A private test profile must never be
serialized into public artifacts or committed.

No 1,000-row load, provider quality benchmark or full restore rehearsal is repeated
for these UI/session changes unless a changed boundary or new failure justifies it.

## V11 rollback boundary

V11 distinguishes `USER_ACTION` from real legacy attestations. New absent legacy
flags must remain NULL; never synthesize them to satisfy old code. Deploy a compatible
worker before the new API. Once `USER_ACTION` records exist, do not blindly send
traffic back to the f87 API/worker or pair an old UI with a new protocol. Use a
reviewed compatible API/worker/Hosting set and check migration/read compatibility.
The existing saved f87 snapshot is provenance, not automatic compatibility approval.
Do not restore an old backup over current users as an unattended rollback test.
