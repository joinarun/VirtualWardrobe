# Implementation Plan: Application foundation

**Feature**: 001-app-foundation | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md)

## Summary

Deliver a containerized local stack with separate customer/staff React shells, Spring Boot API/worker modes, PostgreSQL/Flyway, explicit local adapter contracts and reproducible checks. Business workflows remain in later features.

## Technical Context

**Language/Version**: Java 21, TypeScript 6, Node 24.

**Dependencies**: Spring Boot 4.1.2 from current official Initializr metadata; React 19.3.1, Vite 8.3.4 from current official create-vite template. Exact package versions and lockfile are committed. Maven Wrapper pins Maven 3.10.0.

**Storage**: PostgreSQL 17 with Flyway; ignored local media directory for future adapters.

**Testing**: JUnit, Spring tests, real PostgreSQL health checks, Playwright browser smoke; TypeScript and Oxlint static checks.

**Target**: Docker Compose local Linux containers, eventual GCP Cloud Run.

**Performance**: Foundation health requests are short; no product load or model-latency claim in this feature.

**Scope**: One backend codebase with API and private-worker modes; no authentication business endpoints or cloud calls.

## Constitution Check

Pass before research and after design: one Java backend and relational DB; versioned API; API denies internal worker paths; no customer photos or secrets; fixture clearly labelled; no business scope added; pinned versions and actual acceptance commands. Cloud hosting and live-model quality gates belong to release features, not a claim of this foundation.

## Research decisions

See research.md. Official Spring requirements support Java21 and Maven; Vite supports this installed Node24. Container builds avoid requiring a host JDK. PostgreSQL readiness must use a real connection. No unresolved technical decision remains.

## Project Structure

```text
apps/web/                 React customer/staff shells and Playwright smoke
services/backend/         Spring Boot, Maven Wrapper, foundation controllers/adapters/tests
compose.yaml              PostgreSQL/API/worker/web local stack
Makefile                  bootstrap/dev/down/test/lint/build/e2e
scripts/                  prerequisite and smoke helpers
specs/001-app-foundation/  reviewed specification/design/tasks
```

## API and execution boundaries

API root /api/v1; GET /api/v1/health is liveness metadata. GET /actuator/health/readiness includes database connectivity. API mode denies /internal/**; worker mode denies /api/**. PORT defaults8080; APP_MODE api|worker; APP_ADAPTER_MODE local|gcp and APP_IMAGE_PROVIDER mock|google (only local/mock implemented here). SPRING_DATASOURCE_URL/USERNAME/PASSWORD configure Postgres. Session cookie name __session; auth/session behavior follows feature3.

## Delivery sequence

Scaffold/pin dependencies and ignored configuration; create tests/contracts; implement health/mode guards/adapters and DB migration; build two web shells; add Compose/Make and CI; run real checks; assess convergence against this feature. No constitution exception is required.
