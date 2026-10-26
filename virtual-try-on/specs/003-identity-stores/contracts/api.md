# Identity and store API contract

Implementation baseline for the existing `services/backend` Spring Boot application, package `com.virtualwardrobe`. API prefix `/api/v1`, API mode port 8080, Vite port 5173 with `/api` proxy. This records the implemented feature003 endpoints; catalog, jobs and enquiries are separate later features. Product behavior remains governed by the PRD and constitution.

## Common contract

- JSON request/response fields use camelCase; UUID identifiers and ISO-8601 UTC timestamps are strings. Decimal INR prices and USD spend are strings, never binary floats.
- Every private/auth response sends `Cache-Control: no-store`. Session cookie is `__session`, HttpOnly, SameSite=Lax, Secure outside local development. Request mutation uses `X-CSRF-TOKEN`.
- `GET /auth/csrf` returns `{ "token": "...", "headerName": "X-CSRF-TOKEN" }`. It creates a session if needed. Refetch after login/signup/password change because authentication rotates session/CSRF state.
- `GET /auth/session` returns `{ "user": null }` for anonymous clients, or the user shape below. A disabled account or revoked session becomes anonymous on the next request.
- Errors use `application/problem+json`: `{ "type": "about:blank", "title": "...", "status": 403, "code": "STORE_ACCESS_DENIED", "detail": "...", "fieldErrors": {} }`. Return 401 for absent identity, 403 for known forbidden action, 404 for unavailable/private object IDs, 409 for state conflicts, 422 for field validation and 429 for quota/rate limits. Do not include private IDs in other users' errors.
- Paged workforce lists use `{ "items": [], "page": 0, "size": 24, "total": 30 }` with size max100. Store choices return the authorized collection in the same envelope. Membership/assignee lists return an items array. Persistence objects are not returned directly.

```ts
type User = {
  id: string; kind: 'CUSTOMER'|'WORKFORCE'; name: string;
  email?: string; phone?: string; phoneVerified?: false;
  superAdmin: boolean; enabled: boolean; passwordChangeRequired: boolean;
  memberships: {membershipId:string;storeId:string;storeName:string;role:'STORE_ADMIN'|'STAFF';state:'ACTIVE'|'INVITED'}[];
};
type Store = {
  id:string; name:string; description:string; logoUrl?:string;
  contactPhone?:string; status:'PENDING'|'ACTIVE'|'ARCHIVED';
};
```

One browser session has either customer or workforce identity. The same person may have both account types, but logging into another account intentionally switches the session. Workforce credentials never authorize customer galleries. No need for two cookie names or multiple simultaneous session realms in Phase 1.

## Authentication and account recovery

| Method and path | Input | Output and behavior |
| --- | --- | --- |
| GET `/auth/csrf` | none | CSRF bootstrap above; anonymous allowed |
| GET `/auth/session` | none | `{user: User|null}` |
| POST `/auth/login` | `{kind, identifier, password}` | `{user}`; customer identifier is normalized phone, workforce email; rotate session |
| POST `/auth/signup` | `{name, countryCode, mobile, password, privacyAccepted:true, captchaToken}` | `{user,recoveryCodes:string[]}` once; `phoneVerified:false`; starts customer session |
| POST `/auth/logout` | `{}` | 204, invalidate session and expire cookie |
| POST `/auth/password` | `{currentPassword,newPassword}` | 204; rotate/revoke sessions, satisfy temporary password requirement |
| POST `/auth/recover` | `{phone,recoveryCode,newPassword}` | 204 on successful reset; generic invalid recovery error; consume code atomically, revoke all account sessions |
| DELETE `/me` | `{password, confirm:true}` | 202; revoke all sessions, anonymize/disable the account, remove recovery codes and publish AccountDeleted for later media/enquiry cleanup handlers |

Sign-up CAPTCHA verification checks validity, expected `signup` action, hostname and threshold. Local-only test CAPTCHA adapters are explicit; deployed demo uses real CAPTCHA or keeps self-signup disabled rather than accepting a magic token. Recovery codes are long random single-use values with hashed storage, rate-limited attempts, never logged.

Workforce provisioning and super-admin bootstrap have no public signup endpoint. Temporary-password accounts can call only session, password-change and logout routes until rotation succeeds. Initial admin bootstrap is a CLI command, idempotently refusing to add another initial super admin when one exists. Store admins do not get a global password-reset endpoint.

## Stores and workforce memberships

| Method and path | Input and result |
| --- | --- |
| GET `/stores` | Public active stores; add `?managed=true` for workforce memberships/all stores for super admin |
| GET `/stores/{storeId}` | Public only if active; scoped management may see pending/archived |
| POST `/admin/stores` | Super admin only `{name,description,contactPhone}` → pending Store |
| PATCH `/stores/{storeId}` | Store admin or super admin; profile fields; lifecycle transition ACTIVE requires accepted active admin |
| GET `/stores/{storeId}/members` | Admin-only membership management; return only that store's users and invitations |
| POST `/stores/{storeId}/members` | Admin `{email,name,role}` → existing user invitation or new temporary account; never replace existing credentials; new temp credential shown once in protected response |
| PATCH `/stores/{storeId}/members/{membershipId}` | Admin `{role,state}`; reject final-admin violation; removal is membership-only |
| DELETE `/stores/{storeId}/members/{membershipId}` | Remove store membership, return active assigned tickets to NEW with history |
| POST `/me/invitations/{membershipId}/accept` | Existing authenticated workforce account explicitly accepts membership |
| GET `/admin/workforce` | Super-admin-only paginated workforce directory; no customer gallery or contact directory |
| POST `/admin/workforce` | Super admin creates workforce account and optional super-admin role; one-time temp credential response |
| PATCH `/admin/workforce/{userId}` | Super admin disable/enable/grant/revoke super admin; protect final global/store admin |
| POST `/admin/workforce/{userId}/reset-password` | Super admin only, workforce kind enforced, unique temporary credential once; revoke sessions |

For assigning enquiries, staff need eligible colleague names but not membership administration: `GET /stores/{storeId}/assignees` returns `{items:[{userId,name,role}]}` for active accepted staff/admin. It reveals no other store memberships or unnecessary contact details.

Super admins may access all stores through business routes. Every other workforce request rechecks current accepted membership rather than trusting roles stored in a login token. Membership INVITED is never authorization.


## Frozen UI additions

GET /auth/config returns {signupEnabled:boolean,captcha:{mode:'LOCAL_TEST'|'RECAPTCHA_ENTERPRISE'|'DISABLED',siteKey?:string,action:'signup'},passwordMinLength:12}. Local signup accepts captchaToken='local-development' only if server config mode is LOCAL_TEST and environment is local. Cloud Google mode validates real assessments; missing configuration disables signup.

GET /stores/{id}/members returns {items:[{id,userId,name,email,role,state}]}. Provisioning routes return {user,membership?,temporaryPassword?}; temporaryPassword appears once only for newly created/reset workforce credentials. Workforce list returns {items:User[],page,size,total}. Login returns user including passwordChangeRequired; POST/auth/password returns204 then UI refreshes GET/auth/session and GET/auth/csrf.

## Implemented backend integration details

Public store/detail responses are direct Store objects or paginated items; membership management returns the scoped member list described above. PATCH/admin/workforce/{id} returns a direct User object. Provisioning an existing workforce account to a store returns only that store's memberships unless caller is a super admin; it never reveals unrelated membership lists. Membership deletion returns204 and preserves a REMOVED row.

Identity tables use vw_account, vw_store, vw_membership, vw_recovery_code, vw_audit_event and vw_rate_limit. IdentityService.current()/customer()/workforce()/requireStore() are the authorization boundary for future domain modules. MembershipRevoked, WorkforceAccessChanged and AccountDeleted application events allow later enquiry/photo modules to implement revocation/deletion handlers in the same transaction.

Backend BootstrapRunner initializes only when no super admin exists. Local make bootstrap-admin writes work/bootstrap-credentials.txt with0600permissions, Email and Temporary password lines; never commit it. Cloud startup uses APP_BOOTSTRAP_SUPERADMIN_EMAIL/PASSWORD secret env and does not write a credential file.

Credential rotation uses a private monotonic account credential_version added by V3. The login-validated version is captured in the server session and compared with the current account on each request, so an in-flight old login cannot create a usable post-reset session. Password change, recovery, workforce reset, deletion and disablement advance the version. This is not exposed in User DTOs.

API-mode /internal/** is rejected404 beforeCSRF. Self workforce password reset returns409 SELF_RESET_UNAVAILABLE and directs the operator to their authenticated Change password flow; this prevents an administrative self-reset from logging the operator out before they can retain a generated one-time credential.

Provision membership payload is {id,userId,storeId,role,state}; member-list entries additionally contain name/email. The current frontend uses provisioning user data for one-time credential display and refreshes the authoritative scoped member list afterward. No unrelated membership list is returned to a store admin.

Auth failures use generic details; optional fieldErrors is reserved for future per-field validation responses. Actual current problem bodies contain type,title,status,code,detail. Create/signup routes return200JSON, auth password/recovery/logout and member deletion/acceptance return204, account deletion returns202.
