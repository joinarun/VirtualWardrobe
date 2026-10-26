# Virtual try on requirements and development guide

Start with [the corrected product requirements](docs/PRD.md), then review [the architecture decisions](docs/architecture.md).

Follow [the Spec Kit guide](SPEC-KIT-GUIDE.md) to initialize the project and build its eight features in order. It contains exact terminal commands and Codex prompts, including local development, demo data, verification and GCP deployment preparation.

The baseline keeps Java Spring Boot, uses React for the Phase 1 website, and reserves React Native/Expo for later mobile clients. No application code has been implemented in this package. Project-specific Makefile targets and deployment scripts are instructions for the coding agent to create and verify.

Spec Kit commands and linked Google service information were checked on 26 October 2026. Recheck model availability, pricing and service support during implementation.
