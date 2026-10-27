# VirtualWardrobe

A web application for discovering Indian clothing, previewing garments with AI, and connecting customers with stores. Sarees are the priority category. The implementation lives in [`virtual-try-on`](virtual-try-on/), with one Java Spring Boot backend and separate React customer and staff interfaces.

## Hosted demo

Open [VirtualWardrobe](https://virtualwardrobe-511016.web.app) or the [store workspace](https://virtualwardrobe-511016.web.app/staff). This is a fictional evaluation demo with real Google image generation. Demo credentials are delivered privately and are excluded from Git. Human saree fidelity review remains pending. See [deployment and operations](virtual-try-on/docs/gcp-deployment.md) and [release evidence](virtual-try-on/specs/008-gcp-release/validation.md).

## Run locally

With Docker running:

```bash
cd virtual-try-on
make bootstrap
make dev
make bootstrap-admin
```

The storefront is at http://localhost:5173 and the staff workspace at http://localhost:5173/staff. The bootstrap command writes its generated credential to an ignored, owner-readable local file and requires a password change before business access. It never prints or commits passwords.

Run `make test lint build e2e` for the current acceptance checks. `make down` stops the local services while preserving database data.

## Product and development documents

- [Product requirements](docs/PRD.md)
- [Architecture](docs/architecture.md)
- [Spec Kit development guide](SPEC-KIT-GUIDE.md)
- [Application setup and operations](virtual-try-on/README.md)
- [Feature specifications and acceptance evidence](virtual-try-on/specs/)

The public web app is Phase 1. React Native and Expo mobile clients are planned to reuse the backend in a later phase. Demo fixtures must remain labelled; a live-model connectivity check does not establish saree fidelity. Human visual evaluation is a separate release gate.
