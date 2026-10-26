# Tasks Catalog and media

## Phase1 Setup

- [x] T001 Add V4 catalog/media schema and pinned image/storage dependencies in services/backend/pom.xml and services/backend/src/main/resources/db/migration/V4__catalog_media.sql.

## Phase2 Foundation

- [x] T002 Implement MediaStorage/local adapter and short upload-state transactions in services/backend/src/main/java/com/virtualwardrobe/media/.
- [x] T003 [P] Implement isolated keyless GCP adapter/signing checks in services/backend/src/main/java/com/virtualwardrobe/media/GcpMediaStorage.java.

## Phase3 US1 Store catalog

- [x] T004 [US1] Implement scoped product CRUD/publication/availability/archive/order/reference in services/backend/src/main/java/com/virtualwardrobe/catalog/.
- [x] T005 [US1] Implement actual bounded image/video validation, orientation/metadata stripping and derivatives in services/backend/src/main/java/com/virtualwardrobe/media/.
- [x] T006 [US1] Implement authorize/rawPUT/finalize/media read/delete with post-I/O authorization in services/backend/src/main/java/com/virtualwardrobe/media/.
- [x] T007 [US1] Verify reservation races, MIME/content limits and cross-store/revoked finalization in services/backend/src/test/java/com/virtualwardrobe/media/CatalogIntegrationTest.java.
- [x] T008 [P] [US1] Implement product/media/ordering management UI and raw capability upload client in apps/web/src/.

## Phase4 US2 Discovery

- [x] T009 [US2] Implement public visibility, search/filter/sort/pagination and optimized DTO media URLs in services/backend/src/main/java/com/virtualwardrobe/catalog/.
- [x] T010 [P] [US2] Implement responsive storefront/product detail/filter states in apps/web/src/.
- [x] T011 [US2] Verify draft/archive/store visibility and search/filter/sort in services/backend/src/test/java/com/virtualwardrobe/media/CatalogIntegrationTest.java.

## Phase5 US3 Definitions and logos

- [x] T012 [US3] Implement cycle-free global categories and scoped/global brand CRUD in services/backend/src/main/java/com/virtualwardrobe/catalog/.
- [x] T013 [US3] Implement role-targeted store/brand logo uploads in services/backend/src/main/java/com/virtualwardrobe/media/.
- [x] T014 [P] [US3] Implement category/brand/logo management forms in apps/web/src/.

## Phase6 Validation

- [x] T015 Run regression/backend media tests and browser create/upload/publish/search/archive journey; record specs/004-catalog-media/validation.md.

## Dependencies

T001/T002 precede backend services; GCP adapter and frontend may proceed in parallel against frozen contracts. Schema/product-state transactions precede upload attachment. All scope/content/concurrency checks and browser journeys precede feature5.
