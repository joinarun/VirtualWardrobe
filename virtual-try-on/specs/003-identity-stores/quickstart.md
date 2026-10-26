# Identity validation

Run make bootstrap-admin to create exactly one initial workforce super admin. The command writes an ignored0600credential file only when it generates a local temporary credential. Sign in, rotate the password, then create pending stores and staff/admin memberships. Existing-user invitations require authenticated acceptance. Activate after an accepted active admin exists.

Local customer signup uses the explicit LOCAL_TEST CAPTCHA configuration only. Obtain GET/api/v1/auth/csrf before a mutation, preserve __session cookie, and send X-CSRF-TOKEN. Refetch after login/signup/password/recovery. Use GET/auth/config to decide whether signup is available; never assume an unconfigured cloud mode accepts test tokens.

Run docker compose run --rm backend-tests and project browser tests. Confirm customer recovery code cannot be reused, cross-store membership management fails and concurrent last-admin changes leave at least one active administrator.
