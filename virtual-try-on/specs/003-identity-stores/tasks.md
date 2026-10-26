# Tasks Identity and stores

## Phase1 Setup

- [x] T001 Add session JDBC dependency/configuration and V2 identity/session schema in services/backend/pom.xml and services/backend/src/main/resources/db/migration/V2__identity_stores.sql.

## Phase2 Foundation

- [x] T002 Implement problem responses, current-account/store authorization and global/store locks in services/backend/src/main/java/com/virtualwardrobe/identity/.
- [x] T003 Implement secure session/CSRF security chain in services/backend/src/main/java/com/virtualwardrobe/foundation/FoundationSecurity.java.

## Phase3 US1 Customer accounts

- [x] T004 [US1] Implement CAPTCHA/config and rate-limited signup/login/recovery/password/logout/deletion in services/backend/src/main/java/com/virtualwardrobe/identity/.
- [x] T005 [P] [US1] Implement responsive customer/workforce auth and recovery forms in apps/web/src/.
- [x] T006 [US1] Add actual PostgreSQL account/CSRF/recovery tests in services/backend/src/test/java/com/virtualwardrobe/identity/.

## Phase4 US2 Workforce and stores

- [x] T007 [US2] Implement bootstrap, workforce provisioning/recovery and membership/store routes in services/backend/src/main/java/com/virtualwardrobe/identity/.
- [x] T008 [P] [US2] Implement staff store selector and role-aware management UI in apps/web/src/.
- [x] T009 [US2] Add make bootstrap-admin and scripts/bootstrap-admin.sh without passwords in argv or Git.

## Phase5 US3 Transactional administrator access

- [x] T010 [US3] Protect final global/store admins, invitation acceptance and revocation with row locks and append-only audit in services/backend/src/main/java/com/virtualwardrobe/identity/.
- [x] T011 [US3] Add concurrent last-admin, membership scope and wrong-realm tests in services/backend/src/test/java/com/virtualwardrobe/identity/.

## Phase6 Validation

- [x] T012 Verify frontend browser account/admin journeys in apps/web/e2e/.
- [x] T013 Record backend/frontend checks and converge evidence in specs/003-identity-stores/validation.md.

## Dependencies

Schema/security precede account/store services. Frontend T005/T008 can run in parallel against the frozen contract. Concurrency evidence requires PostgreSQL and real services. Complete all affected journeys before beginning feature4.
