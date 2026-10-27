# Validation quickstart

From virtual-try-on with Docker running: make bootstrap; make dev; then targeted009 backend and browser checks. Required completion gate: make test lint build e2e-clean plus python3 -m unittest discover -s scripts/gcp -p 'test*.py'. Existing credentials and primary data must be preserved; use isolated browser fixtures.

- Login, background/foreground, reload, save in-memory persistent cookies, reopen a fresh context with only unexpired persistent cookies, verify same customer. Then expire/revoke the server session and verify guest/private denial.
- Delay old anonymous/401/CSRF replies across login/account switch; disconnect during resume; verify reconnect and latest-account state without credential persistence in localStorage.
- Select saree, add owned synthetic image, create mock preview without any photo checkbox; background/reload while queued/running, view/save/download/delete and verify scope denial. Assert database USER_ACTION with NULL attestations and legacy compatibility.
- At360/390/430 and desktop exercise navigation, product/filter sheet, upload/result/gallery/login, keyboard and landscape. Inspect screenshots and axe/contrast for all themes and focus. Verify first-paint theme and unchanged image pixels/filter.
- Release only from reviewed clean commit after rootGO; pre-V11 backup, generic smokes and actual no-AI hosted session/mobile/theme checks, then GitHub code CI. Do not print credential/cookie/capability values or reset prior paid journal.
