# Virtual Wardrobe web application

React and TypeScript customer website and store workspace. Development uses Vite with same-origin /api proxying. The project-level Makefile supplies portable container commands.

Customer and workforce routes:

- / and /products/{id} for the real published catalog and image/video detail gallery.
- /account/login, /account/signup, /account/recover and /account/password.
- /account for customer account details and privacy controls.
- /staff/login and /staff for the separate workforce workspace, scoped product/media/brand management, store profiles/team, and platform tools.

The API client uses HttpOnly server sessions and a memory-only CSRF token obtained from /api/v1/auth/csrf. Never add session credentials, recovery codes or temporary passwords to browser storage. Provider secrets belong on the backend; only the CAPTCHA public site key reaches this client.

Signup availability and CAPTCHA mode come from /api/v1/auth/config. A deployed missing/disabled configuration cannot fall back to the explicit local development adapter. Customer and workforce identities remain separate account kinds.

Local checks from this directory: npm run build, npm run lint and npm run e2e. Browser tests use the running application and real local API for account journeys. The privileged workforce and catalog tests additionally require TEST_BOOTSTRAP_FILE and TEST_STATE_DIRECTORY paths supplied by the operator; it never embeds or logs credentials. A missing fixture is an explicit test skip. Product-quality evidence must distinguish that skip from a fully exercised run.

Original demo images and provenance are in public/demo. They are illustrative assets, not actual customer try-on results. Catalog cards use backend JPEG thumbnail URLs; only the editorial hero uses a static illustrative original. Product uploads use server-authorized raw capabilities with supplied headers, followed by authenticated validation. Cloud uploads never receive the CSRF header or cross-origin cookies. Generation and callback actions remain visibly unavailable until their feature contracts are implemented.
