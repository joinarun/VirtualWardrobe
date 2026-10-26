# Feature Specification Saree image evaluation

**Feature Branch**: existing main workspace; directory selection is independent
**Created**: 2026-10-26
**Status**: Ready for implementation
**Input**: Evaluate consented person/saree pairs with configurable image providers, record human scores, latency and spend, keep synthetic fixtures distinct and never claim the 40-pair human gate has passed without actual review.

## User Scenarios and Testing

### User Story 1 Compare saree previews safely Priority P1

An evaluator selects a consented fixture manifest and runs a bounded evaluation, inspecting the resulting preview files and aggregate report.

**Why this priority**: The product depends on garment fidelity; provider connectivity alone does not establish quality.
**Independent Test**: A mock run with three synthetic pairs produces three clearly labelled demo outputs and a report without credentials or paid calls.

**Acceptance Scenarios**:
1. Given a complete synthetic manifest, when a mock evaluation runs, then the report records provider, model, mode, timing and required review without claiming live generation.
2. Given missing provenance, invalid paths or an exceeded spend bound, when an evaluator starts, then the run fails before calling a provider.
3. Given an existing successful live connectivity report, when evidence is documented, then it is identified as connectivity only and is not counted as a garment-quality benchmark.

### User Story 2 Use a real configurable provider Priority P1

An authorized evaluator can generate a real preview from person and garment photos, with provider credentials kept off the client and intermediate thought images excluded from the selected result.

**Independent Test**: A controlled response containing thought and final image parts returns only the final non-thought image. No production call is necessary for this response-selection test.

**Acceptance Scenarios**:
1. Given a valid model response with intermediate and final images, when a result is selected, then the final non-thought supported image is retained.
2. Given a timeout or missing final image, then a classified failure is reported without dumping credentials, input bytes or raw private provider content.

### User Story 3 Review the launch gate honestly Priority P2

An evaluator receives a review sheet for identity, garment fidelity and believable drape, with the launch decision pending until all required human scores exist.

**Independent Test**: A 40-pair report without human scores always says HUMAN_REVIEW_PENDING. Mock runs can never pass the live launch gate.

### Edge Cases

Unreadable or escaping fixture paths; unsupported images; missing consent/source/licence; duplicate pair IDs; rejected provider responses; ambiguous network failure; no final image; invalid output bytes; requested pair count above available pairs; command interruption.

## Requirements

### Functional Requirements

- FR-001: Accept a manifest of unique pairs with person/garment files, adult-self-photo or synthetic provenance, source/licence and permitted usage.
- FR-002: Validate the selected manifest and image inputs before any call; prevent traversal outside its declared asset root.
- FR-003: Default to mock mode and label every fixture output Demo preview. Live mode requires an explicit selection and bounded estimated spend.
- FR-004: Produce one final non-thought output per successful attempt; reject invalid or absent final images.
- FR-005: Make provider/model/location configurable and keep credentials and photo bytes out of reports and logs.
- FR-006: Record success/refusal/failure, elapsed time, estimated or reported usage cost and aggregate accepted-result metrics without inventing human scores.
- FR-007: Generate a human review sheet and retain HUMAN_REVIEW_PENDING until the full 40-pair live gate is actually reviewed. Fixtures never pass the live gate.
- FR-008: Do not automatically retry ambiguous live failures or exceed the configured maximum estimated cost.
- FR-009: Store personal evaluation inputs/outputs only in ignored local work storage. Commit only non-personal aggregate evidence.

### Key Entities

Evaluation manifest, consented input pair, provider request/result/failure, aggregate report and human review record.

## Success Criteria

- SC-001: A three-pair mock evaluation completes without cloud credentials, paid calls or misleading live labels.
- SC-002: All malformed/provenance-free/over-budget inputs fail before provider invocation.
- SC-003: Tests prove intermediate thought images cannot become customer previews.
- SC-004: Every unreviewed run reports pending quality review and the documented connectivity smoke is not counted as a saree-fidelity result.

## Assumptions

The existing synthetic images have documented provenance. The project owner authorized the already completed approximately US$0.04 connectivity smoke. No additional live calls are needed for this implementation. The 40-pair live quality gate is a later human review activity; this feature supplies tooling and makes no claim that it passes.

## Clarifications

### Session 2026-10-26

No critical ambiguities require formal questions. Existing PRD defaults determine adult/self-photo consent, 40-pair scoring and mock/live separation. The parent task explicitly prohibits more live calls during this feature. Connectivity evidence is kept separate from quality evidence.
