# Try-on and gallery validation

Validated on 27 October 2026 with Java 21, Spring Boot 4.1.2, PostgreSQL 17 and an actual 1 GiB container using a 70% heap ceiling. Development tests make no paid image-provider calls.

## Backend evidence

`docker compose run --rm backend-tests` passes **95 tests**, with zero failures/errors/skips. This includes 21 real-PostgreSQL try-on cases, 2 worker HTTP integration checks, 3 generation-policy/input-preparation checks, 8 controlled Cloud Tasks SDK checks, 7 controlled Google worker-token checks, 10 Cloud Storage checks and 44 existing foundation/identity/catalog/provider/media checks. Full log: ignored work/feature005-tests.log. Disposable database schemas isolate tests from the local application and current operator credentials.

The implemented/tested boundaries include:

- Actual session/CSRF upload authorization and finalize, consent before photo capability issuance, private raw capability PUT, source non-readability and owner-only result/download access. Anonymous, other-customer and workforce image requests receive 404.
- Persistent idempotency, same-key conflict, identical retries after terminal source deletion, one customer charge under simultaneous duplicate submission, and independent atomic customer/global/provider limits.
- Cross-owner global spend races, customer refunds without refunding global accepted-request counts, explicit non200 unbilled outcomes, conservative retained spend and separately observed usage.
- Durable failed dispatch/reconciliation and duplicate delivery; an infrastructure failure before claim returns a retryable response rather than acknowledging away queued work.
- One automatic retry for confirmed transient response, success or exhaustion after that retry, no automatic retry of UNKNOWN_OUTCOME, and no old sequence claiming a new attempt.
- Cancellation, discard and account deletion during a blocked provider call, followed by a late successful response: no image resurrection, allowance refunded once, conservative spend retained and late observed usage recorded separately.
- A known successful provider response followed by output-storage failure preserves known usage and refunds the customer. Interrupted started work expires with unknown outcome and cannot repeat its paid call.
- Saved-gallery slot concurrency including SAVING reservations, idempotent save, download, product-archive survival, deletion during a blocked copy and no late saved-object restoration.
- V6 stale-save recovery after five minutes with no progress. Retry uses a new unique saved key; an old late copy/completion cannot replace or remove the newer saved result. Garment reference is frozen at job creation, so later catalog reference changes do not silently switch the selected garment.
- Source/unsaved expiry, retryable deletion failures and saved-output exclusion from expiry. Tracked keys exist before possible writes; deletion has an immediate attempt and a later verification pass to catch capability replay or late copies.
- Production Google generation fails closed without matching operator human-quality approval. Evaluation demo and deterministic fixture modes have distinct labels. Provider JPEG inputs are at most 2048 px on the long edge and under 10 MiB.
- Worker mode requires machine bearer authentication, ignores X-Serverless-Authorization as an authentication source, rejects malformed delivery and exposes no customer API. API mode continues to return 404 for internal routes.

Cloud Tasks tests verify deterministic UUID/sequence identity, OIDC audience/service account, sequence header, 180 second task deadline, 10 second create RPC and duplicate registration handling. Google verifier tests cover required signature-verifier result, issuer, audience, verified service-account identity, algorithm, issued/expiry times and lifetime. Storage SDK operations now have explicit bounded retry/RPC/HTTP settings; controlled tests make no network calls. Their aggregate save-read/write retry budgets are 90 seconds, below stale-save recovery's five-minute margin.

The final backend jar packaged successfully, API and worker restarted, and readiness passed. Migrations V5 and V6 apply to real PostgreSQL. The local worker uses a durable PostgreSQL delivery table and its execution thread pool is not the queue.

## Whole-response provider deadline

The Google adapter enforces an explicit deadline until the complete response body arrives and cancels an unfinished exchange. Its streaming subscriber rejects a body above 24 MiB before unbounded allocation. A timeout retains UNKNOWN_OUTCOME semantics and does not authorize an automatic retry.

An independent Java 21 test run against an isolated feature005 snapshot passed all seven provider tests. A real localhost HTTP server sent headers and then stalled its body: the one-second configured deadline returned UNKNOWN_OUTCOME in 1.151 seconds. A chunked 24 MiB + 1 response was rejected in 0.053 seconds, and a normal final image was accepted. This run used neither cloud credentials nor the shared backend build directory; subsequent full-feature regression includes these three additional HTTP checks.

## Frontend and remaining release evidence

The actual local fixture customer journey already passed, covering invalid source rejection, explicit consent, returned job, duplicate create, private access denial, attachment download, save, re-login, gallery survival after archival and deletion. All 11 final browser tests passed in 25.5 seconds against the final V6 runtime, including the real private fixture journey in 9.9 seconds, existing catalog/identity regressions, unused-source replacement/deletion, and axe contrast checks across seven rendered screens with zero color-contrast violations. SVG icons, frontend build/types, lint and whitespace checks pass. See [frontend-validation.md](frontend-validation.md) for exact evidence. All 16 tasks are complete.

These tests do not establish a deployed Google workflow or human saree quality. Root-owned deployment smoke must exercise actual Cloud SQL, keyless GCS signed uploads/CORS, Cloud Tasks OIDC/private worker, scheduled reconciliation and one bounded live customer job. The 40-pair human quality gate remains pending and production approval is absent. Local mock defaults never make paid calls. Release-scale latency/performance and enquiries remain later features.
