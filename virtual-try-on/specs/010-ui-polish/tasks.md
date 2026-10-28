# Tasks: Customer interface polish

## Phase 1: Specification and plan

- [X] T001 Record owner requirements, clarifications, constitution check, narrow source ownership and acceptance plan in spec.md/plan.md/analysis.md.

## Phase 2: Implementation

- [X] T002 [P] Implement compact appearance control, remove collection count, align filter/sort and show full desktop sign-in image; verify in apps/web/e2e/ui-polish.spec.ts (FR-001/002/006/007).
- [X] T003 [P] Group preview buttons, preserve reachable destructive confirmation, remove preview metadata and rename Buy it; update focused preview/demo regressions (FR-003/004/005).
- [X] T004 [P] Implement and unit-test safe frontend-only existing-site deployment with frontend/backend provenance and fail-closed guards (FR-008).

## Phase 3: Verification and release

- [X] T005 Review final source, run focused responsive/accessibility Chromium+WebKit checks, type/guards/lint/build and deployment unit tests; record actual evidence in validation.md (SC-001/002/003).
- [ ] T006 Commit reviewed source, secret-scan and push existing GitHub feature branch; verify required regression CI (FR-008/SC-003).
- [ ] T007 Publish exact source frontend-only to existing GCP site and verify actual hosted public screens/assets and unchanged backend/data/credentials/paid journal (FR-008/SC-004).
- [ ] T008 Converge against specification and plan, record release evidence and promote/push main after passing gates.
