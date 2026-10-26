# Feature Specification Accounts and store administration

**Created**: 2026-10-27 · **Status**: Ready for planning
**Input**: Implement the PRD identity and store roles, secure sessions, customer signup/recovery, workforce temporary passwords and scoped memberships. Preserve every final-admin invariant under concurrent changes.

## User Scenarios and Testing

### User Story 1 Customer signup login and recovery Priority P1

A customer registers with name, normalized mobile number, password, privacy agreement and validated CAPTCHA; receives recovery codes once, signs in and recovers with an unused code. Their phone remains explicitly unverified. Workforce credentials never unlock this account.

**Independent Test**: Customer signup/login/password change/recovery/logout completes, codes are hashed, reuse fails, sessions are revoked and CSRF-less mutation is denied.
**Acceptance**: Valid signup returns one-time codes. Phone knowledge alone cannot reset. CAPTCHA invalidity is rejected. Existing/disabled credentials produce generic authentication errors. Account deletion revokes login and marks private data deletion for future modules.

### User Story 2 Workforce and store management Priority P1

The operator securely bootstraps one super admin. Super admins create pending stores and workforce users. Store admins create or invite admins/staff only in their administered stores. Temporary credentials expire after24hours and require rotation before business access; existing-user invitations never reset credentials. Accepted initial admins allow atomic store activation.

**Independent Test**: Bootstrap, temporary login/rotation, invitation acceptance, scoped store management and denial of unauthorized stores are exercised against the database.

### User Story 3 Preserve administrator access Priority P1

Administrators cannot concurrently remove, disable or demote the final active super admin or final active admin of an active store. Membership revocation takes effect on the next request and preserves audit attribution.

**Independent Test**: Concurrent attempts against two admins permit at most one removal. Global disablement checks all affected stores. Staff cannot manage memberships, and super-admin reset APIs reject customer accounts.

### Edge Cases

Duplicate normalized identifiers, expired temporary credentials, no remaining recovery codes, repeated invitation acceptance, pending/archived stores, wrong account realm, final admin with multiple memberships, recovery-code races, stale sessions, revoked membership and malicious submitted identifiers.

## Requirements

### Functional Requirements

- FR001 Customer and workforce credentials are separate kinds, with immutable internal identifiers.
- FR002 Signup requires backend CAPTCHA, privacy agreement and normalized unique phone; no OTP claims.
- FR003 Recovery codes are random, one-time, hashed and displayed once. Recovery/password/disablement revoke sessions; phone-only recovery is absent.
- FR004 Secure server sessions, CSRF validation, generic auth errors, bounded rate limits and no-store private responses are mandatory.
- FR005 New workforce accounts get24hour one-time temporary credentials and mandatory rotation; existing credentials remain untouched by membership additions.
- FR006 Super admins create stores and grant global roles. Store admins manage only their stores' memberships and profiles; staff cannot administer users.
- FR007 An ACTIVE store has an active accepted admin. PENDING stores are hidden from the public. Archive preserves historical records.
- FR008 Every final active global/store admin invariant is transactional, including global disablement and simultaneous changes.
- FR009 Workforce lists/invitations/assignees expose only the minimum authorized account information. No customer directory/gallery/impersonation is added.
- FR010 The UI has customer/workforce sign-in, signup/recovery, password rotation, store selector, membership management and pending invitations with mobile/keyboard support.
- FR011 Bootstrap and workforce recovery use generated or securely supplied credentials, never public signup or committed passwords.
- FR012 Add/update/remove memberships preserve append-only audit events and provide a boundary for later enquiry assignment release.

### Key Entities

Account, recovery code, persisted session, store, membership/invitation, audit event and authentication rate limit.

## Success Criteria

- SC001 All intended account/store journeys run through UI and backend without cloud credentials in local test mode.
- SC002 Direct unauthorized cross-store actions and wrong-kind password recovery are denied.
- SC003 Concurrency tests prove final-admin and recovery-code invariants against the actual relational database.
- SC004 Real deployed signup uses server-assessed CAPTCHA; disabled/missing config does not accept a browser magic token.

## Assumptions

Local development alone may use an explicit local CAPTCHA adapter. Deployed self-signup is disabled unless valid real CAPTCHA configuration exists. The operator may bootstrap from an environment secret; generated local credential files use0600permissions and are ignored. Media/logo upload UI waits for the catalog/media feature; store logoUrl accepts safe relative or HTTPS display URLs only in this feature.

## Clarifications

### Session 2026-10-27

No unresolved product ambiguity. PRD defaults govern role scopes, account realms, recovery, activation and24hour temporary passwords. A password change rotates the current session after revoking all previous sessions; the UI refetches session and CSRF. Auth config supplies explicit CAPTCHA settings and signup availability.
