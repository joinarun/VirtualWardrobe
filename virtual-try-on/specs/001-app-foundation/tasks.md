# Tasks: Application foundation

## Phase 1: Setup

- [X] T001 Generate and pin Java21/Spring Boot/Maven Wrapper project in services/backend and React/TypeScript/Vite project in apps/web per plan.
- [X] T002 Create .gitignore, .dockerignore and .env.example so local secrets/build artifacts remain ignored (FR007).

## Phase 2: Foundation contracts and checks

- [X] T003 Add PostgreSQL migration in services/backend/src/main/resources/db/migration/V1__foundation.sql and database readiness checks (FR008).
- [X] T004 Add health/mode/adapter tests in services/backend/src/test/java/com/virtualwardrobe and browser tests in apps/web/e2e before implementation (FR003–005).

## Phase 3: User Story 1 Start and inspect

- [X] T005 [US1] Implement validated execution mode, liveness/readiness and route guard in services/backend/src/main/java/com/virtualwardrobe (FR003, FR005).
- [X] T006 [P] [US1] Implement separate responsive customer/staff shells in apps/web/src/App.tsx and apps/web/src/App.css (FR002, SC003).
- [X] T007 [US1] Implement compose.yaml, scripts/bootstrap.sh and Makefile bootstrap/dev/down targets with printed URLs and safe defaults (FR001, FR006).

## Phase 4: User Story 2 Reproducible verification

- [X] T008 [US2] Implement local storage/queue/image adapter contracts and labelled demo fixture metadata in services/backend/src/main/java/com/virtualwardrobe/foundation (FR004).
- [X] T009 [US2] Add Docker build stages, frontend lockfile and Makefile test/lint/build/e2e targets; preserve DB on down (FR006, SC004).
- [X] T010 [US2] Add ../.github/workflows/ci.yml (Git repository root) and README.md documenting commands, architecture boundaries and failure recovery.

## Phase 5: Verify

- [X] T011 Run make bootstrap/dev/test/lint/build/e2e and record actual evidence in specs/001-app-foundation/verification.md (SC001–004).

## Dependencies

T001→T002→T003/T004→T005/T006/T008→T007/T009→T010→T011. T006 is independent of backend code after the contract. User story1 is the MVP; story2 verifies repeatability.
