# Validate the foundation

Prerequisites: Git, Make, Docker engine/Compose. From virtual-try-on run `make bootstrap`, `make dev`, then visit http://localhost:5173 and http://localhost:5173/staff. `make dev` runs detached and prints service URLs. API is http://localhost:8080/api/v1/health.

Run `make test`, `make lint`, `make build`, `make e2e`. Health/readiness and layout/mode denial checks must pass; no cloud credentials are read. `make down` stops services without deleting volumes. Local-only database password is generated into ignored .env at bootstrap. Build/browser dependencies require initial network download.

If Docker is stopped, commands explain how to start it. Database loss must make readiness fail while liveness remains available. Screens at360px and1280px must retain distinct customer/staff navigation. The provider adapter reports Demo preview and does not call a paid service.
