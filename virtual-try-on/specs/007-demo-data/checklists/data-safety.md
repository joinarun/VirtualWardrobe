# Dataset and credential safety review

- [x] All minima, mock labels and owned asset/provenance boundaries are explicit.
- [x] Credential creation precedes account creation; lost files never reset accounts.
- [x] Every seeded child/object has ownership and unique media keys.
- [x] Partial staging/upload/activation/cleanup and expiring leases are recoverable.
- [x] Incoming FK/polymorphic/key references are checked before destructive steps.
- [x] Bootstrap/unrelated data are preserved; runtime activity is not silently adopted.
- [x] Status/dry-run are read-only, production refuses, no public operation endpoint.
- [x] CLI/wrapper safe receipts and required seeded-browser evidence are specified.

Reviewed before implementation; no critical/high unresolved gap.
