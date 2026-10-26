# Implementation Plan: Demo datasets and operator CLI

**Date**: 2026-10-27 · **Spec**: [spec.md](spec.md)

## Summary and technical context

Use standalone com.virtualwardrobe.demo.DemoMain through the existing executable JAR PropertiesLauncher. It creates no SpringApplication, HTTP listener, bootstrap runner, worker or provider. Reuse JDBC/TransactionTemplate/Hikari/Flyway and the actual MediaStorage/ImageProcessor/MP4 validation classes. Flyway V9 adds dataset lifecycle/lease/fingerprint and an owned-object manifest, plus dataset tags on seeded child records missing them. Main application behavior remains unchanged; frontend uses current mode information and owned optimized assets.

## Constitution check

Pass: approved Java/PostgreSQL/GCP baseline only, no new service or public demo mutation endpoint, no default paid generation, owner-only generated credentials, original licensed/provenanced assets, durable staged activation, bounded concurrency and safe reference-aware cleanup. Production/unknown environments fail before migration/assets/credentials/storage work. No fixture is a live quality result; no human approval is generated. Root owns cloud execution.

## Dataset and credential design

Standard contains12 accounts (3 per role),3 stores,30 sarees across8 original styles/fictional assortment variations, accepted limited/multi-store memberships, categories/global/store brands/logos, Ruby multi-view galleries, one owned derived video, three saved Demo preview fixtures and enquiries across all six states with public/internal/assignment history. Load is a separate profile with one accepted admin/store and1000 published products by default. It does not depend on standard-dataset parents.

Safe dataset IDs and deterministic internal IDs/identifiers make intended records stable. Credentials/recovery codes are random, generated once and written atomically to a nonsymlink0600 JSON and sibling text file before account creation; database stores only password/recovery hashes. Existing/missing/mismatched credentials never reset accounts. Identifier collisions with other data refuse. Asset/profile/schema fingerprints reject changed definitions. Repeat ACTIVE seed returns unchanged counts, preserving runtime edits. Deleted IDs remain tombstoned; choose a new dataset ID to seed again.

## Lifecycle and I/O boundaries

A short database staging transaction reserves a dataset lease, inserts disabled accounts/PENDING stores/DRAFT products/inactive media and every owned object key before any storage write. No global administration lock is held for external work. A renewable bounded lease prevents simultaneous operators; abandoned leases expire. Storage writes run outside database transactions sequentially (one bounded in-flight operation); normalization is cached once per source asset while every media/product receives a unique key under demo/<dataset>/.... Completed manifest entries make partial failure resumable. Only after all required objects are stored does one transaction activate accounts, stores, products, media/gallery and the dataset. Public discovery never receives a half-published seed.

## Cleanup and preservation

Status and cleanup dry-run do not migrate or mutate schema/files/storage. Seed migrates only after environment/target guards. Cleanup defaults to dry-run and execution is explicit. Inspect actual foreign-key relationships from catalog metadata, rejecting incoming references whose child is outside this dataset, plus polymorphic audit subjects and shared media/object-key references. Runtime data defaults NULL and is not silently adopted. Initial unsafe references refuse before state/object mutation; a final guard also protects against late concurrent references.

Execution marks owned accounts disabled/catalog archived/media deleted in a short transaction, keeps the tracked DELETING manifest, removes only owned keys outside the database, and resumes storage failures. Final database deletion rechecks references under the administration guard and removes children/pointers in dependency order. Bootstrap/unrelated rows and objects are never part of the plan. Dataset/object tombstones retain only non-secret lifecycle metadata; credential files remain private local operator artifacts. No broad CASCADE deletion is used.

## CLI, targeting and safe output

Commands and exact safe result schema are frozen in contracts/cli.md. Local uses the existing Postgres/filesystem. GCP requires explicit --project matching APP_GCP_PROJECT and the CloudSQL connection project; ADC handles SQL/storage and passwords enter only child environment. Status/dry-run require existing schema and do not auto-migrate. Main catches raw SQL/GCS failures and emits stable sanitized codes, no stacktrace/identifiers/keys/secrets. All normal output is a safe DEMO_RESULT_JSON receipt. Shell/cloud wrappers print only allowlisted summaries and credential paths.

## Ownership and validation

Backend owns standalone CLI/service, V9, generated credential bundle, fixture builder/asset validation, local commands, tests and spec/contracts. GCP agent owns only the host operator wrapper/controlled tests after planning gate. Frontend owns font/optimized-hero polish, demo warnings and seeded required-browser integration. Root's prepared source assets remain original/provenance-recorded; owned MP4 preparation is deterministic and makes no model call.

Verify real PostgreSQL seed twice, role/catalog/history minima, same credentials/unique object keys, failure/resume/atomic visibility, identifier collision refusal, production refusal, dry-run/executed/idempotent cleanup, bootstrap/unrelated preservation, outside-row/object reference refusal and partial cleanup recovery. Validate a small load fixture quickly and execute the standard30-product CLI locally; root later runs the1000-product cloud profile for A8. Required browser tests sign in using the actual generated dataset credentials and cannot skip silently. Preserve earlier129 backend checks and the standard required browser suite before convergence.
