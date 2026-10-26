# Full E2E runner validation

The standard `make e2e` path now bootstraps protected fixtures, verifies/rotates the operator in Playwright global setup before parallel files, and fails if any journey is unexpectedly skipped. It reuses the packaged ready runtime rather than repackaging a jar while the API is using it. Existing unknown credentials are never reset for test access.

Validated from an ignored stable copy of commit `80ab5f6` plus these runner changes, while the main worktree advanced feature006. `make e2e-clean` itself also copied source/build targets before starting its independent Compose project.

- Fresh database/media/bootstrap/state and separate localhost ports: **11/11 browser tests passed in 17.7 seconds**, with zero skips.
- The current E2E credential differed from its initial temporary input, proving rotation completed before tests.
- Initial credential/current credential modes: 0600; state directory: 0700.
- Source/build target, database, media and operator state were separate from the running application. Only public Maven dependency artifacts were shared. Dedicated containers/network/database volume were removed after the run.
- Required-mode missing fixture: failed actionably before any journey.
- Deliberately skipped proof test: strict reporter returned failure rather than a green partial run.
- Build, lint, shell syntax, Compose validation and diff whitespace checks passed. The existing CI invocation `make test lint build e2e` needs no manual fixture flags.

Ignored evidence: `work/e2e-source-snapshot-20261027-024748/work/virtualwardrobe-e2e-20261027025447-bb9ffa/verification.log` and `result.json`; negative checks in `work/e2e-required-missing.log` and `work/e2e-required-skip.log`. Protected credential files are deliberately not copied into this report or CI artifacts. Later feature006 journeys will run through the same required path.
