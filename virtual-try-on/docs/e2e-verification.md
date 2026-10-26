# Reproducible local browser verification

Run the complete local fixture suite from the application directory:

```sh
make bootstrap
make dev
make e2e
```

`make e2e` waits for the packaged application, runs its idempotent bootstrap CLI and standalone owned-demo seed, prepares protected inputs, and mounts the bootstrap file and generated demo JSON read-only plus a writable owner-only E2E state directory into the browser runner. It reuses the running build rather than recompiling a working tree while the API is using its jar.

Playwright global setup verifies LOCAL_TEST CAPTCHA and FIXTURE generation before exercising accounts. It also validates the generated demo credential schema, owner-only permissions and three users per role before changing any bootstrap credential. The seeded browser journey signs in with all four role credentials and exercises actual catalog media, private fixture previews and customer/store conversation; missing demo input fails the required run. It authenticates the known operator, rotates an initial temporary password once, and atomically saves the verified credential before parallel test files begin. A protected pending credential makes an interrupted rotation recoverable. Existing unknown credentials are never reset to obtain test access.

The standard runner sets `TEST_FIXTURES_REQUIRED=true`. Missing/unusable fixtures fail before journeys; a reporter also fails the run if any required journey is unexpectedly skipped. CI's existing `make test lint build e2e` therefore executes the same full browser path. No paid/live provider environment is exercised by this suite.

Protected paths are ignored by Git:

- Initial input: `work/bootstrap-credentials.txt` (0600).
- Current reusable operator fixture: `work/e2e/admin-credential.json` (0600), inside `work/e2e` (0700).
- Generated demo role credentials: `work/demo/demo-credentials-virtualwardrobe-demo-v1.json` and sibling `.txt` (0600, parent0700).
- Screenshots and test evidence: `work/e2e`.

`BOOTSTRAP_OUTPUT_DIRECTORY`, `E2E_BOOTSTRAP_FILE`, `E2E_STATE_DIRECTORY`, `E2E_DEMO_DATASET` and `E2E_DEMO_CREDENTIALS_FILE` configure protected inputs and the standard dataset. Do not commit or upload their credential files as CI artifacts. A current reusable fixture remains sufficient if its obsolete initial temporary-password input has been removed.

Repeated full suites against the same instance can reach its normal operator login limit (observed during development). Use the isolated command below for frequent reruns; the runner never clears security counters or resets an unknown credential.

For a completely disposable database and media store:

```sh
make e2e-clean
```

This makes a protected source copy, uses a unique Compose project and free localhost ports, and creates separate database, media, bootstrap and E2E state. It does not write the original backend build target or reset the original database. It overrides inherited demo credential paths and dataset options with its own protected locations and standard dataset. Only the public Maven dependency cache may be shared. Dedicated containers and database volumes are removed on normal completion/failure; ignored source/log/result evidence remains under `work/virtualwardrobe-e2e-*`.

For concurrent development, run verification from a coherent source state; a copied half-written file can fail compilation safely without affecting the original runtime. Bare `npm run e2e` without the standard protected runner is useful for optional UI development but is not evidence of a full privileged run.

The standalone seed does not invoke an image provider. UI fixture journeys remain explicitly labelled Demo preview. Automated WCAG2 A/AA and WCAG2.1 A/AA checks now run within the relevant real browser flows, alongside keyboard skip links and 360px overflow checks. They provide automated evidence and do not replace manual accessibility review.
