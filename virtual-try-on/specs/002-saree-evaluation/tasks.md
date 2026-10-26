# Tasks Saree image evaluation

## Phase 1 Setup

- [x] T001 Pin Google Auth Library in services/backend/pom.xml and configure app.ai properties.

## Phase 2 Foundation

- [x] T002 Define bounded image request/result/failure types in services/backend/src/main/java/com/virtualwardrobe/ai/.

## Phase 3 US1 Safe evaluation

- [x] T003 [US1] Implement manifest/provenance/path/budget validation and aggregate report in services/backend/src/main/java/com/virtualwardrobe/ai/BenchmarkMain.java.
- [x] T004 [US1] Add fixture manifest and scripts/ai-benchmark.sh plus Makefile target.
- [x] T005 [US1] Test malformed provenance and pre-call budget rejection in services/backend/src/test/java/com/virtualwardrobe/ai/BenchmarkTest.java.

## Phase 4 US2 Provider adapter

- [x] T006 [US2] Implement Google authenticated REST and final non-thought selection in services/backend/src/main/java/com/virtualwardrobe/ai/GoogleImageProvider.java.
- [x] T007 [US2] Implement mock/provider selection in services/backend/src/main/java/com/virtualwardrobe/ai/AiProviderService.java.
- [x] T008 [US2] Test intermediate/final selection and safe failures in services/backend/src/test/java/com/virtualwardrobe/ai/GoogleImageProviderTest.java.

## Phase 5 US3 Honest evidence

- [x] T009 [US3] Generate blank human review sheets and pending gate output in services/backend/src/main/java/com/virtualwardrobe/ai/BenchmarkMain.java.
- [x] T010 [US3] Document actual connectivity and pending40pair gate in docs/evaluations/connectivity.md.

## Phase 6 Validation

- [x] T011 Run backend regression tests and three-pair mock command, recording results in specs/002-saree-evaluation/validation.md.

## Dependencies and implementation

T001→T002→US1/US2→US3→validation. Provider/parser tests and documentation can proceed in parallel after interface agreement. MVP is safe mock evaluator; real provider support follows without changing evaluator input/report format.
