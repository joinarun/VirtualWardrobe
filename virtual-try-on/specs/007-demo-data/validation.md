# Feature007 validation

Date:2026-10-27. Java21 container, PostgreSQL17, actual local storage,1GiB container with70% maximum heap. This feature invoked no paid provider and made no cloud mutation. The final backend JAR contains the standalone DemoMain entry point; it constructs JDBC/storage/validators directly without Spring, listeners, bootstrap, schedulers, worker or image provider.

## Final gates

- Full backend: `docker compose run --rm backend-tests`,158 tests across16 Surefire reports,0 failures/errors/skips,2m00s. Includes the earlier129 checks plus14 real-PostgreSQL dataset lifecycle cases and15 credential cases. Log: ignored work/007-backend-final.log; XML: services/backend/target/surefire-reports.
- Required browser: standard isolated `make e2e-clean`,14/14 passed in29.6s,0 skips. Fresh standalone-seeded generated-credential customer/staff/store-admin/super-admin journey27.4s. See frontend-validation.md and ignored work/virtualwardrobe-e2e-20261027041134-61d93a/ for protected results/screenshots. Disposable database/media/container/network ownership remained isolated; primary operator/demo credential files were unchanged.
- Frontend build, lint and explicit E2E/config TypeScript checks passed. Expanded WCAG2 A/AA and WCAG2.1 A/AA automated rules, keyboard/mobile checks, local licensed fonts and owned hero derivatives are recorded in frontend-validation.md. Automated checks do not claim complete accessibility conformance.
- Operator wrapper: `python3 -m unittest discover -s scripts/gcp -p test_cloud_demo.py`,9/9 passed without cloud calls. Reviewed cloud plan command produced a plan only. `bash -n scripts/demo.sh` and whitespace checks passed.

## Actual local operator flow

Ran `DEMO_SKIP_PACKAGE=true ./scripts/demo.sh seed` twice using the packaged standalone JAR. First receipt was ACTIVE/changed=true; second ACTIVE/changed=false with identical aggregate counts:

| Record | Count |
| --- | ---: |
| Accounts |12:3 each SUPER_ADMIN,STORE_ADMIN,STAFF,CUSTOMER |
| Stores / accepted memberships |3 /11 |
| Published products / sarees |30 /30 |
| Validated catalog/logo/video media |50 |
| Saved labelled Demo preview gallery fixtures |3 |
| Enquiries / ordered history events |6 /33 |
| Customer recovery-code hashes |24 |
| Unique owned physical objects |102 |

The dataset includes limited/multi-store users, actual normalized full references and optimized thumbnails, Ruby detail/back views, one owned derived MP4, global/store brands with owned icons and all six enquiry states with public/internal/assignment history. Gallery fixtures select the corresponding garment and explicitly identify mock/fixture-v1; they are not human quality evidence.

Generated JSON and sibling text were checked0600, their dedicated parent0700, and no credential file is Git-tracked. The file's SHA256 matched the original database credential digest after the second seed; no credential values or digests were printed. Raw local receipts, safe assertions and credential permission evidence are ignored under work/demo-seed-first.log, work/demo-seed-second.log and work/007-cli-validation.json.

Also executed the actual separate load profile with1000 published products,1003 media rows and2006 unique physical objects. Its dry-run counts matched executed cleanup, its state became DELETED and the standard30-product dataset remained ACTIVE with unchanged owned counts. Receipts: ignored work/demo-load-seed.log, work/demo-load-plan.log, work/demo-load-cleanup.log and work/demo-standard-status.log. Load source processing was cached while per-media keys were unique; actual local execution completed within the same1GiB limit. This proves dataset preparation, not the separate hosted performance acceptance thresholds.

## Transactional and safety evidence

Real PostgreSQL cases verify role/store/catalog/gallery/history minima; actual MP4 duration; unchanged credentials/accounts and no repeated writes on ACTIVE seed; failed object upload leaving disabled accounts/PENDING stores/DRAFT products and no public categories/brands; same-file resume and atomic activation; identity-collision refusal; lost credential no-reset; changed asset-definition refusal; production/target refusal; standalone status/dry-run leaving a genuinely empty schema without tables/migrations/files/objects; scoped dry-run/executed/idempotent cleanup; last usable-super-admin protection; unrelated bootstrap/account/object preservation; ordinary incoming FK, polymorphic audit and shared-key refusal before mutation; late incoming reference refusal before relational deletion; partial deletion recovery with original planned counts; separate load cleanup preserving standard data.

Every object I/O assertion proves no active database transaction. Dataset/object ownership is recorded before storage writes. Cleanup clears only owned nullable cycles and deletes in dependency order, retaining dataset/object tombstones. Runtime activity remains dataset_id=NULL and deliberately blocks cleanup instead of being adopted or removed. Cleanup of active seeded platform administrators requires an enabled permanent-password super admin outside the dataset; temporary/disabled outside credentials do not satisfy this invariant.

Credential tests verify unique random passwords/eight customer recovery codes, exact metadata/definitions/fingerprint, strict JSON/duplicate-key rejection, atomic durable0600 JSON/text, owner700 parent, symlink/hardlink/unsafe-permission refusal, thread/process locking, missing-file no-reset and same-secret text-file repair. Records redact toString and errors use safe codes. Standalone main suppresses library logging and catches raw SQL/storage exceptions without identifiers, URLs, keys, secrets or stacktraces. The local wrapper checks the JAR marker before invoking it; the cloud wrapper pins project/ADC/SQL/storage and captures the database secret only in child environment.

## Requirement traceability and boundaries

FR-001–003: owned fixtures and required actual browser; FR-004–005: credential/lifecycle idempotence/collision tests and actual second seed; FR-006: staged failure/resume/activation tests; FR-007–008: FK/audit/key/late-reference/last-admin/partial-cleanup/production tests; FR-009: actual1000-product load and preserved standard dataset; FR-010: standalone no-context implementation plus empty-schema/explicit-target/wrapper checks; FR-011: final required generated-credential browser and frontend evidence. SC-001–005 and all three stories have the corresponding actual evidence above.

Hosted GCP deployment/smoke/performance, operational cleanup reconciliation and live generation are release-feature work. The40-pair human saree-fidelity gate remains pending; no approval report or quality-pass claim was created. Production Google generation continues to fail closed without operator approval. Fixture verification and future live evaluation remain distinct.
