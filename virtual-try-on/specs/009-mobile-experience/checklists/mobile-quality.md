# Mobile quality review checklist

- [x] Cookie persistence and server role expiry/revocation boundaries are separate and explicit.
- [x] Unknown/offline auth cannot be represented as confirmed guest; stale reads/401/CSRF have tests.
- [x] New photo action never fabricates legacy checkbox attestations.
- [x] Mobile shell/theme/image/accessibility requirements have concrete acceptance tests.
- [x] Migration/backward request compatibility, pre-backup and safe redeploy order are defined.
- [x] Operator quality gates/limits remain distinct from customer presentation; no new infrastructure.

Implementation and actual hosted test results remain unchecked tasks until performed.
