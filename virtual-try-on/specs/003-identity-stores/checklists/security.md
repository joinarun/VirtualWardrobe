# Identity requirements review

- [x] Realm, current-account and current-membership checks cover every private route.
- [x] Auth/session/CAPTCHA/CSRF field shapes are frozen for the frontend.
- [x] Password rotation, credential expiry and recovery-code usage are bounded.
- [x] Final global/store admin checks cover global disablement and races.
- [x] Local-only CAPTCHA and cloud fail-closed behavior are specified.
- [x] Workforce reset cannot target customers; no gallery browser is introduced.

Reviewed requirements quality before implementation; this is not an implementation completion claim.
