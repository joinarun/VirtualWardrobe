# Feature Specification: Application foundation

**Feature**: `001-app-foundation`

**Created**: 2026-10-26

**Status**: Reviewed

**Input**: Continue from the ratified constitution with a runnable, reproducible local application foundation before implementing business features.

## User Scenarios & Testing

### User Story 1 - Start and inspect the application (Priority: P1)

A developer starts the customer website, staff workspace and application services using documented commands, without cloud credentials, and sees whether the application and database are available.

**Independent Test**: Follow the quickstart from a clean checkout and load both layouts.

**Acceptance Scenarios**:
1. Given the listed prerequisites and empty local configuration, when bootstrap and start are run, then local services start and their URLs are printed.
2. Given running services, when the developer opens the customer website and staff workspace, then distinct navigation and appropriately scoped foundation content appears.
3. Given the database is unavailable, when readiness is queried, then the service reports unavailable rather than claiming readiness.

### User Story 2 - Verify a reproducible build (Priority: P2)

A contributor runs documented checks to verify both application layers and can distinguish a mock preview from real AI output.

**Independent Test**: Execute build, test, lint and browser smoke commands without cloud access.

**Acceptance Scenarios**:
1. Given a clean dependency installation, when verification runs, then application artifacts build and health/layout tests pass.
2. Given the local image adapter, when its fixture metadata is inspected, then it explicitly identifies itself as a demo fixture and does not claim live generation.
3. Given an API deployment, when an internal worker path is requested, then access is denied.

### Edge Cases

- A missing Docker engine produces an actionable error.
- Empty configuration uses local-only defaults; no cloud service is contacted.
- Restarting the stack preserves local database data.
- Selecting an invalid execution mode fails startup rather than exposing worker paths.
- A narrow screen retains accessible navigation without horizontal overflow.

## Requirements

### Functional Requirements

- **FR-001**: Provide one documented bootstrap command and one start command that require no cloud credentials.
- **FR-002**: Provide separate customer and staff workspace shells with responsive navigation and clearly deferred business controls.
- **FR-003**: Expose application liveness and dependency-aware readiness separately.
- **FR-004**: Provide local storage, task dispatch and image adapter contracts; mock image metadata must say Demo preview.
- **FR-005**: Support separate API and worker execution modes; API mode must deny internal worker requests.
- **FR-006**: Provide build, unit/integration-test, static-check, browser-smoke and stop commands, with data-preserving shutdown.
- **FR-007**: Include non-secret configuration examples and prevent generated credentials, local media and build artifacts entering version control.
- **FR-008**: Persist a versioned database schema and verify real database readiness.

### Key Entities

- **Application status**: execution mode, adapter mode, version and readiness.
- **Demo image result**: provider identity, fixture indicator and explicit demo label.
- **Foundation schema version**: applied migration and installation timestamp; no business/customer data yet.

## Success Criteria

- **SC-001**: A contributor can start all local services with the documented commands and reach both layouts without a cloud account.
- **SC-002**: The health check detects a reachable application independently from a failed database.
- **SC-003**: Both layouts are usable at 360 px and desktop width with keyboard-visible navigation.
- **SC-004**: All documented foundation verification commands complete successfully and the mock/live distinction is asserted.

## Assumptions

Git, Make and a running Docker engine with Compose are prerequisites. Host Java/Maven are optional because builds run in containers. Browser tests may download their documented browser dependency. Business authentication, catalog management, customer photos, enquiries, cloud provisioning and live model calls belong to later features. The PRD and architecture remain in the parent workspace.

## Clarification review

Reviewed 2026-10-26. No material ambiguity remains: local-only operation, customer/staff layout separation and deferred business scope are explicit. No additional user decision is required.
