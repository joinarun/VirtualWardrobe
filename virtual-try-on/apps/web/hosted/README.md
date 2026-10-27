# Hosted evaluation verification

This runner is separate from the required local Playwright suite. The local suite continues to require LOCAL_TEST CAPTCHA and FIXTURE generation. Hosted execution requires the actual reviewed Hosting inventory, generated cloud credentials and a root-dispatched release. Actual execution receipts remain protected under `work/gcp`; see the release verification document for their current status.

```sh
npm --prefix apps/web run hosted:test
npm --prefix apps/web run hosted:verify
```

The second command is a plan: no network, credential read, browser, mutation or provider call. `npm test` also runs the controlled hosted policy tests after TypeScript checks.

## Actual dispatch

Only after a clean source commit, root deployment, bootstrap rotation and standard cloud seed, root may execute:

```sh
node apps/web/hosted/verify.mjs --run
```

This makes one ordinary real CAPTCHA signup attempt and exercises actual customer/staff login, session/CSRF continuity, public catalog media, direct API internal404, callback consent/duplicate handling/first-open claim, public/internal replies, customer reply, reassignment, closure/history and cross-scope denials. It does not create a new try-on job. A CAPTCHA challenge, rejection or ambiguous outcome is recorded blocked without retry or score changes; the independent seeded-account checks may still complete. Exit0 means the requested checks passed,2 means signup remains blocked,1 means a verification failure. No account is deleted.

The exact project and Hosting origin are hard-coded from the reviewed008 contract. The inventory must match project, region, demo environment, bucket and40-character source revision. Credentials are read only from a regular0600 file with one hard link; symlinks and permissive files fail. Default inputs are ignored `work/gcp/deployment.json` and `work/gcp/demo-credentials-virtualwardrobe-demo-v1.json`. Explicit `--inventory` and `--credentials` may select protected inputs, while target allowlists remain fixed.

State is fixed to this project's `work/gcp`, independent of each fresh `hosted-verification-*` output directory. `--work-directory` must resolve to that exact canonical state directory; it cannot move the paid-action guard to a fresh location. The state directory must be a real0700 directory. A container with only apps/web at/app must mount this same host state at/work/gcp and pass input paths inside that mount; its canonical state path is/work/gcp.

## Pinned browser container

When host Playwright browsers are unavailable, build the existing pinned browser target from the application root:

```sh
docker build --target e2e -t virtualwardrobe-hosted-verifier:local apps/web
docker run --rm \
  --mount "type=bind,source=$PWD/work/gcp,target=/work/gcp" \
  virtualwardrobe-hosted-verifier:local node hosted/verify.mjs \
  --inventory /work/gcp/deployment.json \
  --credentials /work/gcp/demo-credentials-virtualwardrobe-demo-v1.json
```

That invocation still prints only a plan. Root may append the separately authorized execution options after deployment; the container uses the same fixed journal on the mounted host directory. No debug/trace environment is forwarded. The image contains only frontend source/owned assets and no work directory or credential inputs.

## One bounded real job

Root must separately authorize the single paid action. Only then:

```sh
node apps/web/hosted/verify.mjs --run --allow-one-live-job
```

The runner uses the original committed owned hero-person PNG and the available Ruby occasion product in the store shared by two accepted seeded staff. It confirms the actual EVALUATION_DEMO/Google/model config and all three UI consents. Before the one paid UI click it creates `work/gcp/hosted-live-job.json` exclusively, synchronizes its file and parent directory, and never replaces that reservation with another new attempt. A pre-existing journal blocks a new paid action, even after a crash or unknown provider outcome. Do not delete/move it merely to make a retry pass. The signup credential/attempt record also persists once at `demo-credentials-hosted-signup.json`; successful signup recovery codes are preserved there before UI confirmation.

The actual browser first uploads the original Blob through the returned GCS capability, with automatic Content-Length and no cookies/CSRF. The verifier binds the exact first PUT and awaits its CDP wire-header/status observation; Playwright interception can omit the automatic length from its high-level header view. Only safe status/boolean diagnostics leave the observer. The runner holds the genuine finalize request, replays that same Blob/headers through browser fetch while the raw object exists, requires412 and then continues the unchanged original finalize request. Finalizing first would delete the raw object and invalidate the replay proof. No cloud response is mocked.

It observes actual persistent job states and records server created-to-terminal completion (including queue time), terminal observation, attempts and client timing before any save/login/download/delete actions. Completion must meet the server180-second deadline. Whole-workflow and post-submission lifecycle timing are separate. Provider usage is explicitly unavailable in the job DTO; the runner does not invent an estimated charge, percentile or human fidelity approval. A failed or unknown job is not replaced automatically.

After success it verifies rendering, source-read404, second-customer/workforce404, private no-store, explicit save, logout/login persistence, actual download and deletion of only the new result while preserving the original gallery. The downloaded owned synthetic evaluation result remains a protected artifact. New runtime enquiries remain ordinary runtime history; they may correctly block dataset cleanup rather than be silently adopted/deleted by the seed tool.

If a previously created job needs read-only continuation:

```sh
node apps/web/hosted/verify.mjs --run --resume-live-job
```

This requires the existing journal's recorded job ID and never submits another job. It skips repeating the callback conversation. It cannot safely infer an ID when submission was ambiguous; root must inspect the real customer job list and preserve the one-attempt guard. A completed/deleted result is not a reason to create another job.

## Privacy and evidence

The runner refuses DEBUG/DEBUG_FILE/PWDEBUG, Node HTTP/native debug and NODE_OPTIONS, Chrome log-file and Playwright debug/trace/HAR environment controls before credentials or Playwright import. No tracing, HAR, video, storageState export, console/request logging or raw error output is enabled. Do not enable diagnostic logging around a hosted run; it can expose password fills, cookies and CDP signed URLs outside sanitized exception handling.

Screenshots use390×844/DPR2,4×CPU,9Mbps down/1.6Mbps up,150ms latency and disabled browser cache. The safe receipt records actual browser/Node versions, platform and architecture; an explicit host Chrome executable uses a temporary Playwright profile and never the user’s normal profile. Hosted UI waits are bounded at60seconds for cloud/client diagnostics; this does not change the server180-second job deadline or the independent3-second/750ms performance thresholds. Fixed role-slot/action breadcrumbs identify a failing step without recording input values. Inputs, selects, recovery codes, credentials, contact details, identity areas and conversation actor/assignment names are masked. Secret-bearing capabilities remain only in memory. Reports allow only safe codes/statuses/counts/timing/provider metadata; no account directory, contact, cookie, token, signed URL, request body or raw exception is serialized. File writes use0600 and output directories0700. Review `receipt.json` in the newest ignored `work/gcp/hosted-verification-*` directory; reports/screenshots/downloads are never Git/CI artifacts.

This proves an operational evaluation journey when actually executed. It does not establish the40-pair human quality gate, a generation latency p95, field-user performance or production promotion. The GCP performance/backup/monitoring tools have separate actual-run evidence and limitations.
