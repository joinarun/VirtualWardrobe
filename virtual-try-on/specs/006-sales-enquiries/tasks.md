# Tasks: Sales enquiries

## Phase1 Setup

- [x] T001 Add V7/V8 enquiry/event schema, active unique index and retention configuration.
- [x] T002 Implement authoritative contact consent/config and customer callback creation/snapshot/duplicate behavior in services/backend/src/main/java/com/virtualwardrobe/enquiries/.

## Phase2 Store workflow

- [x] T003 Implement scoped read-only list/detail/counts and eligible-assignee DTOs.
- [x] T004 Implement explicit atomic claim, assignment and fresh authorization after locks.
- [x] T005 Implement status/close/reopen transitions and active-uniqueness guard.
- [x] T006 Implement plain public replies, internal notes and ordered customer/staff history filtering.

## Phase3 Lifecycle and privacy

- [x] T007 Implement membership/access event handlers unassigning active work to NEW.
- [x] T008 Implement customer-account deletion redacting contact and every free-text event body.
- [x] T009 Implement per-record closed-retention transactions through existing worker/local maintenance.

## Phase4 User interfaces

- [x] T010 [P] Implement callback confirmation/consent, customer enquiry list/detail/replies in apps/web/src/.
- [x] T011 [P] Implement store counts/polling/list/detail, explicit claim/assignment/status/reopen/replies/internal notes in apps/web/src/.

## Phase5 Verification

- [x] T012 Verify creation/claim/reopen/assignment/revocation races and GET nonmutation against real PostgreSQL.
- [x] T013 Verify direct HTTP scope/CSRF/customer visibility, state/reply rules and full account/retention redaction including races.
- [x] T014 Run browser callback→claim→public reply/internal note→customer reply→close workflow and earlier-feature regressions/build/lint; record specs/006-sales-enquiries/validation.md.

## Dependencies

T001 precedes domain services; T002/T003 precede mutations and frontend. Lifecycle handlers use the same lock order as store/customer services. Frontend may proceed after contract/checklist/tasks/analysis freeze. All verification and convergence precede feature007. No cloud/GCP/frontend source changes by the backend owner.
