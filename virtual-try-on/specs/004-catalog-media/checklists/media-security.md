# Catalog media requirements review

- [x] Authorize, raw upload, finalize, read and delete boundaries are explicit.
- [x] Reservation count concurrency and publication constraints are specified.
- [x] Actual image/video type and size/dimension/duration validation are required.
- [x] Metadata stripping/orientation and thumbnail/reference roles are clear.
- [x] Long I/O occurs outside DB locks and attachment repeats authorization.
- [x] Logo/global/store scopes and no-external-fetch policy are explicit.
- [x] Signed capabilities expire quickly; cloud bucket stays private.

Reviewed requirements quality before implementation; no claim of implemented code.
