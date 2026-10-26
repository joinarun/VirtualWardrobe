# Catalog acceptance

Start make dev and sign in to the workforce UI. Create or select an authorized store, add a draft product, upload a JPEG/PNG/WebP using returned capability headers, finalize, set category/price/cover/reference and publish. Browse anonymously, search/filter/sort, verify optimized card bytes and then archive; confirm disappearance from discovery while authorized staff can still open it.

Try a corrupt image/MIME mismatch, an over-limit image/video, a cross-store ID and concurrent11thimage authorizations; all must fail without publishing unvalidated content. Upload a logo to its exact store/brand target. Run backend tests and the catalog browser journey. Do not claim cloud signed PUT browser validation from local tests; record it separately during deployed smoke.
# Operator media limits

Defaults permit 10 MiB / 20 megapixel JPEG, PNG or WebP images and 50 MiB / 30 second MP4 videos. APP_MEDIA_MAX_IMAGE_BYTES, APP_MEDIA_MAX_IMAGE_PIXELS, APP_MEDIA_MAX_VIDEO_BYTES and APP_MEDIA_MAX_VIDEO_SECONDS may lower those defaults. Larger values require a separately tested resource profile and are rejected at startup.

The local runtime uses JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=70, matching the hosted 1 GiB service profile. Validation evidence includes the complete backend suite inside a 1 GiB container, with two simultaneous allowed 20 MP image decodes. Whole-file processing and image decoding are bounded to two concurrent operations. A 429 response may be retried with the same upload ID; expiry or rejected content requires choosing the file again.

The MP4 fixtures under services/backend/src/test/resources/catalog are original synthetic 32×32 colour videos generated with FFmpeg, with durations of 2 seconds and 31 seconds. They contain no retailer assets or personal photos.
