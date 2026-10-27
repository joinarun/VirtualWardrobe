# Feature 009 mobile release

The mobile experience and persistent sessions are deployed at
[VirtualWardrobe](https://virtualwardrobe-511016.web.app). The application source is
`c2d7549356ce3ef06d3ffe8c40f63c023f8d1543`, published on 2026-10-27 at
20:16:25 UTC. The final hosted browser verification passed at 20:29:18 UTC and
the independent final preservation check passed at 20:32:16 UTC.

Only existing resources in project `virtualtryon-511016`, region `asia-south1`,
were used. StyleReel and the default Hosting site were preserved. No generation,
upload, seed/reset, load test or restore was performed for feature 009.

## Deployed provenance

| Item | Actual release |
| --- | --- |
| Full application source | `c2d7549356ce3ef06d3ffe8c40f63c023f8d1543` |
| Cloud Build | `671b76c1-66d3-4eb3-8c9a-fbc8ecf15723`, Linux/amd64 |
| API revision | `virtualwardrobe-demo-api-00003-s7f`, 100% current traffic |
| Worker revision | `virtualwardrobe-demo-worker-00004-745`, 100% current traffic |
| Shared image digest | `sha256:3cf5e86312b295abb2419d83809b257dfc49201f3fd6fdecc1e1807f298b7817` |
| Image repository | `asia-south1-docker.pkg.dev/virtualtryon-511016/virtualwardrobe/backend` |
| Hosting version | `sites/virtualwardrobe-511016/versions/4a125de8f8008e61` |
| Hosting release | `sites/virtualwardrobe-511016/channels/live/releases/1793132185142000` |
| Schema | Flyway versions 1–11 applied |
| Pre-V11 backup | `1793130585090`, source schema 10, verified `SUCCESSFUL` at 19:51:21 UTC |

The compatible worker was deployed before the API, retaining its captured canonical
URL as the OIDC audience throughout the update. Both services resolve to the same
immutable image. Hosting pins the new API revision. The API URL is
`https://virtualwardrobe-demo-api-ynpzfmjw7q-el.a.run.app`; the IAM-private worker
URL is `https://virtualwardrobe-demo-worker-ynpzfmjw7q-el.a.run.app`.

The application commit passed
[GitHub CI run 40575639855](https://github.com/joinarun/VirtualWardrobe/actions/runs/40575639855)
in 9m48s. Source gates included 192 backend checks, 37 required Chromium cases,
21 targeted WebKit cases across runs, TypeScript/lint/build and the security scan.
The operator suite passed 44 checks. The final hosted-verifier correction passed
21 guard checks; it changes test ordering only and is separate from the deployed
application source above.

## Actual hosted checks

Chrome `156.0.8078.48` exercised the real Hosting origin with protected test
profiles. The final receipt is
`work/gcp/mobile-verification-keqxtC/receipt.json`.

| Check | Observed result |
| --- | --- |
| Customer session | Secure persistent cookie; actual Chrome process close/reopen retained login |
| Staff session | Actual Chrome process close/reopen retained login |
| Explicit logout | Both customer and staff logout completed; session revoked |
| Customer layout | Six pages at 360, 390, 430, 844 and 1280px |
| Appearance | Pearl, Sage, Midnight and System; reload retained preference |
| Accessibility | 16 customer and 3 staff axe AA scans, zero violations |
| Customer photo flow | No attestation checkboxes or provider/model/deployment/benchmark banners |
| Foreground/reload | Existing customer identity retained |
| Browser errors | Zero JavaScript errors and zero blocked mutation attempts |
| Private artifacts | 49 screenshots with private gallery/result images masked |
| No-AI boundary | Zero new uploads or jobs; customer jobs/gallery snapshots and historical paid journal unchanged |

The seven generic smoke checks also passed: website, same-origin API rewrite and
direct API health returned 200; the public worker returned 403; API internal paths
and internal maintenance/job POSTs returned 404. These checks did not create users,
orders, uploads or provider jobs.

A physical Android/iPhone app switch, lock/unlock and browser reopen remains a
manual device check. Desktop viewport/process-restart evidence and targeted
WebKit results do not establish that physical-device result. No provider quality
benchmark or generation latency claim was added by this release; the separate
40-pair human saree evaluation remains pending internally.

## Session contract and runtime limits

| Setting | Deployed value |
| --- | --- |
| `APP_SESSION_CUSTOMER_SECONDS` | `2592000` — 30 days idle for new customer sessions |
| `APP_SESSION_WORKFORCE_SECONDS` | `28800` — 8 hours idle |
| `APP_SESSION_ANONYMOUS_SECONDS` | `1800` — 30 minutes idle |
| Browser cookie | `__session`, up to 30 days, Secure/HttpOnly/SameSite=Lax, path `/` |
| API | 1 CPU, 1 GiB, concurrency 20, min 0/max 2 instances, connection pool 5 |
| Worker | 1 CPU, 1 GiB, concurrency 2, min 0/max 1 instance, connection pool 3 |
| JVM | `-XX:MaxRAMPercentage=70`; remaining memory reserved for native/runtime use |
| Generation limits | 5/customer/day, 100/global/day, USD 5.00 daily application budget, USD 0.25 reservation/attempt |
| Saved image limit | 100/customer |

Both services receive the session properties; the worker remains stateless. The
serializer derives cookie lifetime from the authenticated upper bound. Server
role limits, temporary credential expiry and revocation remain authoritative.
Existing f87 sessions retain their old interval and browser-session cookie until
one new sign-in/session rotation obtains persistence. Configuration does not
retroactively upgrade those cookies. Cookie expiry from issuance and a server idle
interval are separate limits.

Runtime configuration verification passed 8/8 checks with the canonical worker
URL and the limits above. Environment remains `demo`, adapters use GCP and the
Google image provider; no production quality-approval flag was supplied. The
existing Cloud SQL `db-f1-micro`, storage, queue, maintenance and IAM settings were
retained. Cloud SQL/storage continue to incur charges while idle; min-zero Cloud
Run permits cold starts. The existing native INR 2,500/month project budget is
alerts-only, includes StyleReel charges and uses existing billing-owner recipients.
It is not a hard spend cap. Seven-day GCS soft deletion is separate recoverability
from live object access.

## Final preservation evidence

`work/gcp/009-final-preservation.json` is owner-only mode 0600 and passed all 11
checks against the fresh feature-009 baseline after the browser run. This used a
read-only database transaction and object/resource metadata; it made zero
application HTTP requests, model calls or cloud mutations.

| Aggregate | Final value; unchanged from baseline |
| --- | --- |
| Accounts | 14 enabled: 4 customers, 10 workforce; independent bootstrap superadmin retained |
| Catalog | 3 stores, 30 published products |
| Enquiries | 10 enquiries, 61 history events |
| Jobs and attempts | 6 jobs, 6 attempts; 0 active jobs |
| All-time Google provider starts | 3; **zero additional starts for feature 009** |
| All-time ledger | 3 accepted requests, USD 0 reserved, USD 0.75 committed |
| App observed token-rate estimate | USD 0.12324; an application estimate, not Cloud Billing |
| Private images | 4 saved; 9 SOURCE records, all already DELETED |
| Live storage objects | 103 total, including 102 standard demo objects and 0 load objects |
| Cleanup queue | 0 pending rows |
| V11 compatibility | 9 genuine legacy-attestation records; 0 invalid legacy/fabricated user-action flag records |

The extra live saved object is preserved current user content. No runtime photos
were downloaded for these metadata checks. All-time accounting avoids hiding a
change at a UTC day boundary. Maintenance may expire SOURCE objects independently
of new submissions; the check also compares total records and all-time attempts.

Standard JSON/TXT credentials, bootstrap credentials and the existing paid-action
journal remained byte-identical and mode 0600. The journal hash remains
`bbbf537d33fa93e0ebcd008c20b19450a6bdc9ba93a36dc979927a99483596ad`.
API/worker revisions, image digest and Hosting version matched the release
inventory. StyleReel remained revision `stylereel-00013-6xr`.

Protected receipts remain under ignored `work/gcp/`; they contain safe aggregate
results rather than passwords, cookies, contact details, object keys or signed URLs:

- `009-predeploy-snapshot.json` and `009-pre-v11-backup.json` — fresh baseline and successful backup.
- `009-deploy-c2d7549356ce-execution.json` and `009-deployment.json` — completed deployment/provenance.
- `009-smoke-report.json` — seven generic checks.
- `009-runtime-config-verification.json` — eight runtime/config checks.
- `mobile-verification-keqxtC/receipt.json` — final hosted browser pass.
- `009-final-preservation.json` — final 11/11 preservation comparison.

## Retained failure history

The first source `099d8fd9ef795cad2b76f7bd71f7977fe4912b41` applied V11 and deployed
compatible backend revisions, then stopped before Hosting because the installed GA
Scheduler update command accepts `--update-headers`, not `--headers`. The operator
now selects the supported flag for update while retaining `--headers` for create;
delivery URI, OIDC identity/audience, schedule and message remain unchanged. A
controlled regression covers this distinction. The first CI also found a duplicate
store-profile success notice. The UI fix was verified while holding the genuine
response, then the clean c2d source was rebuilt and deployed. No additional migration
or backup was necessary after the already successful schema-10 backup.

The first hosted browser run completed customer persistence/layout/theme checks but
its verifier read the session immediately after clicking logout, racing the async
POST. The application already awaited logout. The verifier now waits for the
genuine 204 and landing before reading the session; the final customer/staff run
passed. An earlier artifact permission precheck also stopped before credentials or
browser execution; the non-secret inventory was set to owner-only mode. Historical
failure receipts are retained; neither verifier correction required another deploy.

## Future release and rollback boundary

Future application releases must use a reviewed clean commit and preserve the
HEAD-image guard. Capture fresh safe aggregates and protected-file hashes, back up
before a migration when required, deploy a compatible worker with the captured
canonical URL before the API, then publish the matching Hosting pin and compare
the same boundaries. Do not reset users, seed again or replace the paid-action
journal. A 1,000-row load test or full restore rehearsal need not be repeated for
UI/session-only changes unless a changed boundary or new failure warrants it.

V11 distinguishes `USER_ACTION` from real legacy attestations. Absent legacy flags
must remain NULL; never synthesize them to satisfy old code. Once user-action
records exist, do not blindly send traffic back to the f87 API/worker or pair an old
UI with the new protocol. Use a reviewed compatible API/worker/Hosting set and check
migration/read compatibility. Historical f87 revisions are provenance, not automatic
rollback approval. Do not restore an old backup over current users as an unattended
rollback test.
