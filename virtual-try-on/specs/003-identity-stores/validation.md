# Identity and store validation

Backend and frontend implementation complete. See frontend-validation.md for the browser evidence.

## Backend evidence

- `docker compose run --rm backend-tests`:27passed,0failures/errors/skips. This includes15 identity integration tests plus12 foundation/provider/evaluator regressions.
- Identity integration uses a separate random PostgreSQL schema migrated through Flyway, leaving the development application database untouched. Its disposable schema is removed afterward.
- Actual tests cover signup, hashed one-time recovery and code reuse rejection; concurrent recovery; CSRF rejection and real bootstrap-header/cookie flow; HttpOnly __session and session rotation; temporary-password backend gating; failed-signin flood with alternate phone formatting and durable429throttle; wrong-store administration; scoped existing-user invitations without password reset or unrelated membership leakage; final global/store admin rollback; concurrent store removals and global demotions; global disablement that would strand a store; expired credentials; oversizedUTF8passwords; cloud local-CAPTCHA fail-closed; customer deletion anonymization/session+recovery revocation; and stale successful-login snapshots issued only after credential rotation being denied by version checks.
- `make bootstrap-admin`:created the initial local super admin, writing only ignored work/bootstrap-credentials.txt with0600permissions; no credential values were printed. Subsequent invocation is idempotent.
- Local API and worker restarted and readiness passed. GET/auth/config returns LOCAL_TEST only in the local environment.
- `bash -n scripts/bootstrap-admin.sh` and `git diff --check`:passed.

## Remaining feature evidence

Frontend type/build and lint passed. All5browserchecks passed in16.3seconds, including real customer signup→recovery-code download→recovery→login→deletion, operator/staff credential rotation, invitation acceptance, store activation, visible final-admin protection, staff scope, membership removal and archival. A separate controlled UI test verifies disabled signup cannot fall back to local CAPTCHA. API internal-route404guard also passed. All13tasks are complete. No cloud CAPTCHA assessment success is claimed by these local tests.

## Credential race follow up

Root review found an in-flight old-login versus password-rotation race. V3 adds monotonic credential_version, captured in each session and checked against the fresh account before protected requests. The regression verifies an unrotated control session reaches its route but the same validated login snapshot issued after rotation receives401 and never reaches the private route. The full27testbackend suite passed after this correction. API-mode internal GET was manually verified404 after package/restart.
