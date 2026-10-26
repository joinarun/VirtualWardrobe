# Catalog and media API contract

All paths use /api/v1. Existing cookie/CSRF and problem responses apply. UUIDs/timestamps are strings, price is a decimal string in INR. Store/workforce scopes are rechecked server-side.

## Shapes

Category={id,name,parentId:string|null,children:Category[]}. GET/categories returns {items:Category[]} as a tree. Category creation/patch body {name,parentId?:string|null}; global super admin only; parent changes reject cycles.

Brand={id,storeId:string|null,name,logoUrl?:string}. GET/brands?storeId=UUID returns global and selected-store brands in {items:Brand[]}. Without storeId, public brand filters include globals and brands from ACTIVE stores. With storeId, include globals plus that store's brands; a pending/archived store requires current authorized workforce scope. Global brand mutations super admin only; store-brand mutations allow staff/admin of that store. Brand PATCH accepts {name}; logos use the target-specific upload route.

Product={id,storeId,storeName,sku,title,description,categoryId:string|null,categoryPath:string[],brandId?:string|null,brandName?:string,labels:string[],price:string,currency:'INR',fabric,colour,size,status:'DRAFT'|'PUBLISHED'|'ARCHIVED',availability:'AVAILABLE'|'UNAVAILABLE',tryOnEnabled:boolean,coverUrl?:string,coverMediaId?:string,referenceMediaId?:string,createdAt,updatedAt,media:Media[]}.

Media={id,kind:'IMAGE'|'VIDEO',state:'VALIDATED',mimeType,url,thumbnailUrl?:string,position:number,width?:number,height?:number,durationSeconds?:number}.

coverUrl ALWAYS points to the optimized JPEG thumbnail, not the multi-MB source image. Media.url is the metadata-stripped full-resolution normalized JPEG for images or validated MP4. Product referenceMediaId points only to a validated product image, whose trusted bytes the backend can read without external HTTP fetching.

CreateProduct body requires sku,title; remaining fields may be supplied for a draft. Price defaults'0.00',currency INR,size'Free size',availability AVAILABLE,status DRAFT,tryOnEnabled true. Publishing requires title,sku,category,price and at least1validated image. Product PATCH accepts editable fields above plus mediaOrder:string[],coverMediaId:string|null,referenceMediaId:string|null. mediaOrder is an exact permutation of the product's current validated media IDs; invalid/foreign IDs reject422/409. Cover/reference must be image IDs belonging to that product. Defaults choose the first validated image.

## Routes

- GET/products?q=&categoryId=&storeId=&brandId=&label=&minPrice=&maxPrice=&sort=newest|price_asc|price_desc&page=0&size=24 -> {items:Product[],page,size,total}; public only published products from ACTIVE stores. Category filter includes descendants. Search covers title,description,brand and labels. UNAVAILABLE remains visible with UI actions disabled.
- GET/products/{id} -> Product; public if visible, otherwise current authorized staff/admin only. Anonymous and out-of-scope requests to private product/media IDs receive404.
- GET/stores/{storeId}/products?status=&q=&page=&size= -> paginated Product including drafts/archived for scoped workforce.
- POST/stores/{storeId}/products -> Product draft.
- PATCH/stores/{storeId}/products/{id} -> Product; all product/store relationships verified.
- DELETE/stores/{storeId}/products/{id} ->204; archive without erasing records/media.
- GET/categories -> tree; POST/admin/categories and PATCH/admin/categories/{id} -> Category.
- GET/brands?storeId= -> {items:Brand[]}.
- POST/admin/brands and PATCH/admin/brands/{id} -> Brand for global scope.
- POST/stores/{storeId}/brands and PATCH/stores/{storeId}/brands/{id} -> Brand for store scope.
- POST/stores/{storeId}/products/{id}/uploads -> UploadAuthorization.
- POST/stores/{storeId}/logo/uploads -> UploadAuthorization; store admin/super admin.
- POST/stores/{storeId}/brands/{brandId}/logo/uploads -> UploadAuthorization; scoped staff/admin.
- POST/admin/brands/{brandId}/logo/uploads -> UploadAuthorization; super admin.
- POST/uploads/{uploadId}/finalize -> {media:Media}. A valid product upload is attached automatically; a logo upload atomically replaces that target's current logo after validation.
- DELETE/stores/{storeId}/products/{id}/media/{mediaId} ->204; preserve published-image minimum, clear cover/reference if needed and select defaults.
- GET/media/{mediaId}/thumbnail and GET/media/{mediaId}/content -> image/video bytes locally or302 to a short cloud signed URL. Public only for validated published product/active-store media or eligible logos; authorized managers may view draft media. Quarantine/rejected/deleted media never returned. Customer photos are never served through these catalog routes.

## Upload flow

Authorize body={fileName,contentType,bytes:number,kind:'IMAGE'|'VIDEO'}. Product images JPEG/PNG/WebP ≤10MiB and20MP; video MP4 ≤50MiB and30seconds. Logos accept images only with the same image bounds. Authorization reserves a slot; pending/processing/validated product uploads count toward10images/1video. Rejected/deleted reservations release a slot.

UploadAuthorization={uploadId,uploadUrl,method:'PUT',headers:Record<string,string>,expiresAt}. The browser sends File/Blob as the raw body using method and headers verbatim; do not attach cookies/CSRF to cloud URLs. Local uploadUrl is a same-origin capability endpoint with X-Upload-Token already supplied in headers. That raw-upload path is exempt from cookie CSRF because it requires a narrow expiring signed capability. Authorization/finalization remain authenticated CSRF-protected requests.

The local raw PUT is /uploads/{uploadId}/content. It checks the single-purpose token, MIME, expected byte count, expiry and single-use state before accepting bounded bytes. Cloud signed PUT binds Content-Type and expected Content-Length; browser Blob sets length automatically. Finalize always independently validates actual bytes/content, checks current authorization and atomically attaches. It never trusts file extensions, MIME claims, object paths or IDs supplied by the client.

No database connection is held while receiving bytes, reading storage or decoding/re-encoding media. Final attachment repeats authorization under store/product locks. Invalid content returns422; expired/invalid state returns409; access loss returns403; oversized raw upload returns413. Finalization may be retried after success and returns the existing validated media.

Receiving and whole-file processing each have two permits per instance and a one-second bounded wait. Busy requests return429; an upload waiting to finalize remains retryable without retransmitting bytes. Image decoding has an additional shared two-permit bound for reuse by later customer-photo processing. Expiry during processing prevents attachment after that reservation stops counting toward the file limit.

Operators can lower validation limits with APP_MEDIA_MAX_IMAGE_BYTES (10485760), APP_MEDIA_MAX_IMAGE_PIXELS (20000000), APP_MEDIA_MAX_VIDEO_BYTES (52428800), and APP_MEDIA_MAX_VIDEO_SECONDS (30). Values above this release's tested resource envelope fail startup. The server remains authoritative if a lower limit is configured.

Generation and callback buttons are navigation placeholders until their later features; they must not imply a submitted request or actual try on in004.

Nullable brandId clears a product brand; nullable categoryId is allowed only for drafts. Nullable parentId puts a category at the root. Product.fabric is a string. Logo finalization updates Store.logoUrl or Brand.logoUrl to /api/v1/media/{uploadId}/thumbnail after validation; new GET of the relevant entity returns that URL.
