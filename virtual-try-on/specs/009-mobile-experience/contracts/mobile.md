# Frozen009 interface and UX contract

## Authentication
Existing GET /api/v1/auth/session returns200{user:null} for confirmed absent/expired/revoked sessions and200{user:...} for current auth; non200/transport failure is not a confirmed guest. Cookie name/CSRF/logout endpoints and role checks stay unchanged. New successful customer sign-in/session rotation sets persistent cookie and30day idle; permanent workforce stays8hour idle. Anonymous idle30min. Temporary expiry is enforced even on an already-open temporary session. Existing f87 sessions may require one login to receive persistence. Frontend generations protect auth, CSRF and account switches; focus/pageshow/online/visibility coalesce read-only revalidation. No automatic generation mutation on resume.

Configuration defaults: APP_SESSION_CUSTOMER_SECONDS=2592000, APP_SESSION_WORKFORCE_SECONDS=28800, APP_SESSION_ANONYMOUS_SECONDS=1800. Serializer lifetime derives from the authenticated upper bound; server role limits remain authoritative.

## Checkbox-free photo authorization
GET /api/v1/try-on/config adds processingRequest:{version:<opaque action-v2>,action:"TRY_ON"}. Legacy metadata may remain for old clients/operator harness compatibility but new customer screens render no provider/model/location/budget/deployment/benchmark content.
POST /api/v1/me/try-on/uploads sends productId,fileName,contentType,bytes and processingRequest:{version,action:"TRY_ON"}; no consent/adult/ownPhoto/providerProcessing flags. Return shape(uploadId/uploadUrl/method/headers), exact signed length/MIME/create-only, finalize, create-job/idempotency, gallery/download/delete and all role/owner limits remain unchanged. New basis USER_ACTION stores legacy attestation fields NULL. Legacy consent bodies remain supported only as real LEGACY_ATTESTATION requests; reject both-body/missing/false/mismatched cases. No synthetic hidden checked consent.

## Customer shell and content
Choose saree→add photo→view preview. Compact mobile header; Collection/Previews/Saved/Account bottom nav with safe-area padding and44px targets. Sticky create/save actions must not cover inputs, content, keyboard or navigation. No page-wide demo/evaluation/provider warnings or checkbox interruptions. Use Virtual preview, Sample for seeded examples and concise actual queue/retry states. Passive Privacy view covers generic photo handling/retention; internal metadata and production quality gate remain operator-only. Account/signup/recovery and optional store contact-share intent otherwise retain their security behavior.

## Themes
Pearl,Sage,Midnight,System. Validated non-secret enum only, same-origin external head initializer to avoid flash, accessible chooser, cross-tab/system updates, graceful unavailable storage. Semantic tokens cover customer and staff surfaces; product images have no theme filter. No private API/photo caching or new offline mode.

## Release consistency
V11-compatible worker goes first, with existing canonical URL preserved; API/static release follows. Preserve users/credentials/data and old paid-action journal. Do not automatically restore f87 API/worker after USER_ACTION records exist; use coordinated compatible rollback. Actual hosted session/reopen/resume/theme/privacy smokes use protected fixtures without another model job unless root separately authorizes one.
