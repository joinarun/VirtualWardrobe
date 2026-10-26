# Virtual Wardrobe web application

React and TypeScript customer website and store workspace. Development uses Vite with same-origin /api proxying. The project-level Makefile supplies portable container commands.

Customer and workforce routes:

- / and /products/{id} for the real published catalog and image/video detail gallery.
- /account/login, /account/signup, /account/recover and /account/password.
- /account for customer account details and privacy controls.
- /try-on?product={id}, /account/previews, /account/previews/{id}, and /account/gallery for customer-only consent, generation requests, and saved previews.
- /staff/login and /staff for the separate workforce workspace, scoped product/media/brand management, store profiles/team, and platform tools.

The API client uses HttpOnly server sessions and a memory-only CSRF token obtained from /api/v1/auth/csrf. Never add session credentials, recovery codes or temporary passwords to browser storage. Provider secrets belong on the backend; only the CAPTCHA public site key reaches this client.

Signup availability and CAPTCHA mode come from /api/v1/auth/config. A deployed missing/disabled configuration cannot fall back to the explicit local development adapter. Customer and workforce identities remain separate account kinds.

Local checks from this directory: npm run build, npm run lint and npm run e2e. Browser tests use the running application and real local API for account journeys. The privileged workforce and catalog tests additionally require TEST_BOOTSTRAP_FILE and TEST_STATE_DIRECTORY paths supplied by the operator; it never embeds or logs credentials. The standard `make e2e` path mounts required protected fixtures, initializes/rotates the operator before parallel tests, and fails on any unexpected skip. Use `make e2e-clean` for an isolated source/database/media run. Direct optional npm runs remain partial when fixtures are absent; they are not full verification. See `docs/e2e-verification.md`.

Original demo images and provenance are in public/demo. They are illustrative assets, not actual customer try-on results. Catalog cards use backend JPEG thumbnail URLs; only the editorial hero uses a static illustrative original. Product uploads use server-authorized raw capabilities with supplied headers, followed by authenticated validation. Cloud uploads never receive the CSRF header or cross-origin cookies. The try-on flow reads provider/mode/retention/allowance from the server, records adult/self-photo/provider consent before upload, and distinguishes local fixtures from real evaluation or live outputs. Personal source files accept JPEG/PNG only and stay in memory until an authorized upload; replacing an already uploaded photo discards its unused source. Persistent job pages poll actual states, pause while hidden, and support explicit save, same-origin attachment download, cancel and discard. A request retry retains its cryptographic idempotency key. Gallery access is customer-only and survives product archival. Callback requests now collect versioned contact-sharing consent and lead to private customer conversations. Store counts poll every 30 seconds while visible; body-only POST search keeps contact terms out of URLs. Opening an eligible unassigned request sends an explicit claim POST. Assignment, customer-visible status reasons, closure outcomes, reopening, public replies and separate internal notes are recorded in history. No customer photo/preview identifiers are shared through enquiries.
