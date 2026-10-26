# Feature Specification Catalog and validated media

**Created**:2026-10-27 · **Status**:Ready for planning
**Input**: Staff manage their stores' products and validated media; customers browse published collections with search/filter/sort; categories/global brands belong to super admins and store brands to scoped staff/admins. Preserve references and prioritize sarees.

## User Scenarios and Testing

### User Story1 Curate a store catalog PriorityP1

Authorized staff create drafts with SKU/title/description/category/brand/labels/INRprice/fabric/colour/size, upload1–10photos and one optional video, select cover/reference and publish. They can reorder media, mark availability and archive without breaking historical records.

**Independent Test**: Staff upload a valid image to their product, publish it and see an optimized card and full detail. Wrong-store and unauthorized upload/finalization attempts fail.
**Acceptance**: Drafts may have no photos; publishing needs at least one validated image and required catalog fields. Concurrent authorizations cannot reserve more than10images or1video. Invalid file content, >20MP images, >10MB images, >50MB or >30second videos cannot become published media.

### User Story2 Discover sarees PriorityP1

Guests and customers search titles/descriptions/brand/labels and filter by category/store/brand/price/label, with pagination and newest/price sorting. Only published products from active stores appear. Unavailable items remain visible with actions disabled.

**Independent Test**: A published item appears in matching search and filters, while drafts/archived items and pending/archived stores remain hidden. Card images use small derivatives rather than full-resolution uploads.

### User Story3 Maintain categories brands and logos PriorityP2

Super admins maintain a category hierarchy and global brands. Staff/admins maintain store brands and tags; store admins can upload store logos and staff/admins store-brand logos. Global brand logos remain super-admin controlled.

**Independent Test**: Category cycles and cross-store/global brand mutations fail; valid target-specific logo uploads attach to the intended store/brand.

### Edge Cases

Duplicate store SKU; category cycles; foreign-store brand/media IDs; forged upload token; expired/reused upload; changed membership during upload; corrupt/MIME-mismatched files; missing cover/reference; too many pending upload reservations; product archive during processing; invalid MP4 structures/duration; storage failure; no useful search results.

## Requirements

- FR001 Every product has exactly one store; all mutations/media authorization/finalization enforce current scope.
- FR002 Catalog fields, DRAFT/PUBLISHED/ARCHIVED and AVAILABLE/UNAVAILABLE states follow the PRD; price is decimal INR.
- FR003 Publishing requires managed category, valid fields and at least one validated image. Cover/reference/order refer only to that product's validated media.
- FR004 Upload reservations and file count limits are concurrency-safe, with actual content/size/dimension/duration verification before attachment.
- FR005 Re-encode product/logo images to strip metadata and preserve orientation; create optimized thumbnail derivatives while retaining a trusted full-resolution normalized reference.
- FR006 Stream/process storage outside held database transactions; recheck authorization before committing final attachment. Unvalidated/quarantine bytes never become public.
- FR007 Public visibility, text search, filters, predictable sorts and pagination follow the PRD; unavailable items clearly disable generation/callback actions.
- FR008 Categories remain a cycle-free managed tree; global/store brands have correct mutation scopes and cannot be mis-mapped to another store's product.
- FR009 Target-specific reusable logo upload attaches only after validation; no external URL fetching is added.
- FR010 Archive removes public discovery but preserves product/media references for later enquiry snapshots.
- FR011 Staff/customer layouts provide accessible loading/error/empty states, original image-led shopping views and mobile layouts.

## Success Criteria

- SC001 An authorized employee creates, uploads, publishes, searches, edits and archives a product through the UI.
- SC002 Direct API and concurrent tests prove store isolation, publication/media validation and reservation limits.
- SC003 Catalog cards use optimized derivatives with substantially smaller payloads than supplied multi-megabyte source fixtures.
- SC004 No quarantine or foreign-store media is returned through public paths; valid local and cloud-storage adapters share the same verified attachment boundary.

## Assumptions

Local storage is the default and real GCP storage is pluggable without provisioning resources in this feature. Customer-photo uploads, generation jobs and enquiry tables remain later features. Video is catalog content only and is not sent to a model. Media signed URLs expire within5minutes. Brand/category referenced records are preserved; product DELETE archives.

## Clarifications

### Session2026-10-27

PRD defaults settle role scopes and file limits. Product PATCH accepts mediaOrder,coverMediaId,referenceMediaId; coverUrl always points to an optimized derivative. Common upload-finalize returns {media}; logo finalization auto-attaches to its authorized target. Local upload capabilities use a single-purpose header token and bypass cookie CSRF only for the raw signed upload path, matching cloud signed-upload behavior; authorize/finalize still require authenticated CSRF-protected requests.
