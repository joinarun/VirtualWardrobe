# Virtual Wardrobe web application

React and TypeScript customer website and store workspace. Development uses Vite with same-origin /api proxying. The project-level Makefile supplies portable container commands.

Identity routes:

- /account/login, /account/signup, /account/recover and /account/password.
- /account for customer account details and privacy controls.
- /staff/login and /staff for the separate workforce workspace.

The API client uses HttpOnly server sessions and a memory-only CSRF token obtained from /api/v1/auth/csrf. Never add session credentials, recovery codes or temporary passwords to browser storage. Provider secrets belong on the backend; only the CAPTCHA public site key reaches this client.

Signup availability and CAPTCHA mode come from /api/v1/auth/config. A deployed missing/disabled configuration cannot fall back to the explicit local development adapter. Customer and workforce identities remain separate account kinds.

Local checks from this directory: npm run build, npm run lint and npm run e2e. Browser tests use the running application and real local API for account journeys. The privileged workforce test additionally requires TEST_BOOTSTRAP_FILE and TEST_STATE_DIRECTORY paths supplied by the operator; it never embeds or logs credentials. A missing fixture is an explicit test skip. Product-quality evidence must distinguish that skip from a fully exercised run.

Original demo images and provenance are in public/demo. They are illustrative assets, not actual customer try-on results. Catalog, generation, gallery and enquiry interfaces will be added through their own feature contracts.
