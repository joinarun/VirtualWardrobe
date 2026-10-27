# Data model

## Session policy
Browser cookie remains __session, Secure in GCP, HttpOnly, SameSite=Lax,path/. Persistent lifetime up to2592000seconds; customer idle2592000, workforce28800, anonymous1800. Temporary workforce expiry remains absolute and is checked on authenticated requests. Existing sessions/credentialVersion revocation are preserved; persistence applies on new sign-in. No bearer token, cookie, password or account directory in localStorage.

## Photo processing request
V11 introduces request_basis with exactly LEGACY_ATTESTATION or USER_ACTION. Legacy rows keep their existing true attestations/version/time and default legacy write behavior. USER_ACTION rows store the version, actor, timestamp and server processing snapshot; the fixed TRY_ON action is implied by this dedicated try-on request table rather than a separate action column; legacy adult/own-photo/provider-processing fields are NULL. Constraints and service validation reject mixed bases and absent/mismatched version/action. User action is TRY_ON. Job snapshot validation chooses its basis; old queued records remain usable. No existing owner/product/job data is removed.

## Appearance preference
One enum: pearl,sage,midnight,system. Stored locally without secrets, interpreted before first paint. System resolves by current prefers-color-scheme; explicit selection persists across route/reload/reopen and cross-tab events. Failure/corruption falls back to system. No photos/credentials are cached by this feature.
