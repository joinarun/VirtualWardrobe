# Implementation Plan Catalog and media

**Date**:2026-10-27 · **Spec**:[spec.md](spec.md)

## Summary and technical context

Extend the existing Spring Boot/JDBC/PostgreSQL backend, React storefront/workspace and Flyway V4 catalog/media schema. Keep one backend. Use a MediaStorage interface with bounded local filesystem storage and a genuine keyless GCPStorage implementation (Google Cloud Storage2.75.0), without cloud provisioning during this feature. TwelveMonkeys WebP3.15.3 decodes WebP; metadata-extractor2.22.0 reads EXIF orientation. Re-encode to metadata-free JPEG with optimized thumbnail/full normalized reference. A bounded ISO-BMFF parser validates actual MP4 ftyp/moov/mvhd/video track/duration without adding a transcoding service.

## Constitution check

Pass before/after design: all store/global/category/brand/media mutations use current authorization; server selects object keys; quarantine is private; actual content and count constraints precede publication; streaming/processing is outside DB transactions; cloud keys are signed through workload identity, never long-lived keys. Product archival preserves records. GCP media storage is already within the baseline. No customer photos/jobs/enquiries are introduced.

## Data and concurrency

vw_category,vw_brand,vw_product and vw_media_upload store catalog entities and durable upload reservations. Store/product locks serialize reservation count, reordering, publication, deletion and attachment; the global administration guard precedes store locks to align with existing role revocation. I/O and processing occur between short authorization/state-claim and final attachment transactions; final attachment rechecks current role/target/state. Raw upload and processing claims are conditional and idempotent; stale quarantine is eligible for later maintenance.

## Source ownership

Backend agent owns catalog/media services, schema, interface/local adapter, image/video processing, controllers, dependencies/config and backend tests. Frontend agent owns apps/web/e2e. GCP agent owns isolated GcpMediaStorage/keyless signer classes and controlled SDK tests. Shared contracts freeze in contracts/api.md before parallel work.

## Validation

Test public visibility/search/filter/sort, store/global scope, SKU/category/brand rules, category cycles, actual image content/MIME/EXIF stripping/derivative size, MP4 duration/content, reservation concurrency and finalization after revoked access. Use real PostgreSQL for all transactions. Browser journey uploads a genuine image through the capability flow, publishes/searches/archives and rejects invalid media. Cloud SDK signing is controlled/no-network; actual bucket/browser signature smoke occurs at deployment.

## Resource and authorization refinements

Receiving bytes, whole-file processing and decoded images have bounded two-operation concurrency, with a one-second wait and retryable429 response. Dimensions are inspected before decoded allocation. The1GiB/70% heap profile is shared by local API/worker/tests and hosted services. Configurable file limits may be lowered within that tested envelope.

General PNG metadata extraction can inflate compressed ancillary text independently of dimensions. PNG therefore reads only its bounded, uncompressed eXIf orientation tag; text and profile metadata are ignored and removed during normalization. JPEG/WebP use the EXIF reader. A real PNG fixture expanding to2GiB in its text chunk verifies this boundary without allocating that content.

Mutation authorization is read after acquiring the administration guard, including earlier identity/store mutators. Final attachment repeats enabled-account, role, membership, target and unexpired-reservation checks after storage processing; a demotion while waiting for the guard cannot use an older global-role snapshot.
