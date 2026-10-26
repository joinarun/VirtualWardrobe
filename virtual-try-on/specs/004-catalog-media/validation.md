# Catalog and media validation

Validated on 27 October 2026 with Java 21, Spring Boot 4.1.2 and real PostgreSQL 17. The local default uses filesystem storage and the mock image provider. No provider generation or cloud mutation was performed for this feature.

## Backend

`docker compose run --rm backend-tests` passes 53 tests with zero failures/errors/skips: 4 foundation, 15 identity, 8 provider/evaluator, 10 catalog integration, 7 media validation and 9 GCP storage signing checks. The final full run used an actual 1 GiB container and `JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=70`; this resource profile is now explicit in compose.yaml for API, worker and tests. The local ignored run log is work/feature004-tests-1g.log.

Catalog/identity integration tests use random isolated PostgreSQL schemas with the real Flyway migrations and remove only those schemas after completion. Application records, uploaded objects and operator credentials remain untouched.

The tests exercise:

- Draft publication requirements, active-store visibility, combined search/category/label/price filters, availability, archival and retained audit records.
- Cross-store product/upload access, foreign-store brand mappings, global definition permissions, category cycles and upload-owner checks.
- The actual HTTP raw-upload capability without a session/CSRF token, forged and reused capability rejection, finalize CSRF protection, quarantine 404 responses and corrupt-content rejection/deletion.
- Eleven concurrent image authorizations yielding exactly ten reservations; rejected slots becoming reusable; the one-video limit.
- Two blocked storage-processing operations causing a third request to return 429 without claiming its upload; retry of that same upload succeeding after capacity frees.
- Membership revocation during actual storage I/O preventing final attachment, with no active database transaction during storage reads/writes.
- Expiry during processing preventing attachment after the reservation no longer counts toward the file limit.
- Deterministic demotion while waiting for the administration lock, verified through PostgreSQL blocking-pid state, denying both catalog category creation and existing global workforce provisioning. All identity/store mutators now re-read roles after that lock; store authorization refreshes enabled/global state.
- Product-specific cover/reference/order, malformed order and boolean inputs, published last-image protection and role-targeted brand/store logos.
- Actual PNG/JPEG decoding, declared-type mismatch, dimension rejection before decoded allocation, EXIF orientation and stripping, full normalized JPEGs and 640 px thumbnails. Two allowed 20 MP images complete concurrently within the 1 GiB profile.
- A valid tiny PNG with ancillary compressed text expanding to 2 GiB is normalized inside that same memory profile without inflating its text; bounded PNG eXIf extraction still applies orientation correctly.
- Original synthetic MP4 fixtures at 2 seconds and 31 seconds, corrupt structures and configurable lower duration/pixel limits. MP4 validation checks the bounded ISO-BMFF structure, video track and duration metadata; it does not run a codec/transcoder.
- Controlled Google SDK V4 signing checks for MIME, exact byte length, private caching, create-only upload precondition, short TTL, path rejection, metadata read bounds and generation-pinned object reads. These make no cloud calls.

The final backend packaged successfully, API/worker restarted and readiness passed. The full browser regression also passed against that final runtime.

## Browser and remaining deployment checks

All 7 browser checks passed in about 11 seconds against the final runtime; frontend build/types and lint passed. See [frontend-validation.md](frontend-validation.md) for actual catalog and earlier identity journeys, including real PNG/MP4 upload, logos, optimized derivative bytes, cover/reference/order, publication, filters/sorting/pagination, unavailable and archived states, and 360 px layouts. All 15 implementation tasks are complete.

Cloud bucket CORS, browser signed-PUT header interoperability and actual keyless bucket access must be smoke-tested at deployment; local and controlled SDK checks do not establish that evidence. Quarantine lifecycle configuration is prepared, with application cleanup responsible for the later 24-hour retention obligation.

Customer photos, async generation, enquiries, demo datasets and performance release benchmarks remain their planned later features. This feature supplies trusted normalized garment bytes and optimized catalog media without exposing future customer purposes through catalog routes.
