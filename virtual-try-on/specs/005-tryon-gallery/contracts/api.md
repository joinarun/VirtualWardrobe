# Try-on and gallery API contract

All public paths use /api/v1, existing session cookies, CSRF and problem responses. Private owner failures return404, including workforce callers; login-required entry points may return401. Private responses and media use no-store. Money is decimal-string USD/INR as named. No customer source-photo read URL exists.

## Configuration and allowance

GET /try-on/config is public and returns:

```
{enabled:boolean,disabledReason:string|null,mode:'FIXTURE'|'EVALUATION_DEMO'|'LIVE',
 provider:string,model:string,location:string,label:string,notice:string,
 consent:{version:string,notice:string,providerPolicyUrl:string|null,
 sourceRetentionHours:24,unsavedRetentionHours:24,savedLimit:100,privateUrlSeconds:300,
 adultSelfOnly:true},limits:{customerDaily:5,globalDaily:100,dailyBudgetUsd:'5.00'}}
```

The notice distinguishes local Demo preview from real AI EVALUATION DEMO with human-quality review pending. Every real output also explains that appearance, garment detail and drape may differ and that it supplies no size/fit guarantee. The consent notice identifies provider/model/location, possible processing outside India for global inference, application retention and provider-policy limitations. No provider zero-retention promise.

GET /me/try-on/quota -> {used:number,remaining:number,limit:number,resetsAt:string,saved:number,savedLimit:number}. Daily reset is UTC. Quota does not expose other customers or individual global usage.

## Consent and source upload

POST /me/try-on/uploads body:

```
{productId:string,fileName:string,contentType:'image/jpeg'|'image/png',bytes:number,
 consent:{version:string,adult:true,ownPhoto:true,providerProcessing:true}}
```

Returns UploadAuthorization={uploadId,uploadUrl,method:'PUT',headers:Record<string,string>,expiresAt}. The current provider/consent version is checked and immutably recorded BEFORE authorizing upload. Only a published, available, try-on-enabled product in an active store is accepted. Source is bound to that product/owner. JPEG/PNG≤10MiB/20MP; metadata stripped; no WebP person input in Phase1. No source image is exposed after upload.

Raw Blob PUT uses exactly returned headers and no cross-origin cookies/CSRF, matching catalog upload behavior. Local capability path is /private-uploads/{uploadId}/content with a single-use X-Upload-Token; only this raw route bypasses cookie CSRF. Cloud path is a short create-only signed PUT binding MIME/length. Capability expires in5minutes.

DELETE /me/try-on/uploads/{uploadId} ->204 discards an unused owner source; a linked source returns409 SOURCE_IN_USE and directs job cancellation/discard. At most3 unused unexpired sources may remain active; authorization is limited to10 attempts per10minutes.

POST /me/try-on/uploads/{uploadId}/finalize -> {source:{id:string,state:'VALIDATED',expiresAt:string}}. Upload owner and product availability are rechecked after I/O. Busy429 is retryable with the same upload ID. Corrupt/mismatched content422, expired/conflicting state409, foreign private ID404. An unused validated source expires within24hours; a source can create only one job.

## Persistent jobs

POST /me/try-on/jobs body {productId,sourceUploadId,idempotencyKey}. Use a fresh crypto.randomUUID() for a new deliberate intent. Keep the same key while retrying an ambiguous HTTP create response. Identical key/input returns the same job without consuming more allowance; changed input with the same key returns409 IDEMPOTENCY_CONFLICT. Successful creation returns Job directly, including when enqueue is temporarily unavailable.

GET /me/try-on/jobs?page=0&size=20 -> {items:Job[],page,size,total} newest first.
GET /me/try-on/jobs/{id} -> Job.
POST /me/try-on/jobs/{id}/cancel -> Job; QUEUED/RUNNING become CANCELLED, idempotent afterwards. It cannot undo a provider call already started.
POST /me/try-on/jobs/{id}/save -> Job; explicit, idempotent. result.saving may be true while another request performs the copy; poll the job until saved. Gallery count includes pending saves; capacity100 is enforced atomically. A copy interrupted for five minutes is recovered to an unsaved result by maintenance; explicit retry uses a fresh unique key, and old completions cannot alter a newer save.
DELETE /me/try-on/jobs/{id} ->204; cancel active work, discard source/output/saved copy and hide this job from customer lists/details. Repetition returns204 for its owner. No late response can restore it.

Job shape:

```
{id,productId,product:{id,title,sku,storeId,storeName,price,currency:'INR'},
 state:'QUEUED'|'RUNNING'|'SUCCEEDED'|'FAILED'|'EXPIRED'|'CANCELLED',
 createdAt,updatedAt,deadlineAt,attempts:number,provider,model,demo:boolean,
 evaluationDemo:boolean,label,notice,discarded:boolean,
 error:null|{code:string,message:string,canRetry:boolean},
 result:null|{id:string,imageUrl:string,downloadUrl:string,expiresAt:string|null,
 saved:boolean,saving:boolean},canCancel:boolean,canSave:boolean,canDiscard:boolean}
```

Job.product is the immutable snapshot. For current availability UI may fetch the normal product API; a gallery remains accessible even if that lookup returns404. Source bytes/keys, signed capabilities, internal claim tokens and provider raw responses are never in Job.

Polling starts about every3seconds, backs off and pauses when hidden. Stop on terminal states; no invented percentage. FAILED/EXPIRED may offer Try again by navigating to a fresh product/consent/upload flow because terminal sources are removed. UNKNOWN_OUTCOME must say the previous provider outcome is unknown and was not automatically retried; a customer must deliberately start new work. No direct retry endpoint silently reuses removed photos.

Quota failures429 use CUSTOMER_DAILY_LIMIT/GLOBAL_DAILY_LIMIT/PROVIDER_BUDGET_LIMIT; paused/unapproved configuration503 uses GENERATION_PAUSED/QUALITY_APPROVAL_REQUIRED. The customer allowance is refunded once on technical failure/cancel/expiry; global accepted-request count and potentially billed attempt accounting remain separate.

## Gallery and private media

GET /me/try-on/gallery?page=0&size=20 -> {items:SavedPreview[],page,size,total}.
SavedPreview={id,jobId,product:Job.product,createdAt,provider,model,demo,evaluationDemo,label,notice,imageUrl,downloadUrl,currentAvailability:'AVAILABLE'|'UNAVAILABLE'|'ARCHIVED'}.
DELETE /me/try-on/gallery/{id} ->204; immediately remove new image access and schedule physical deletion. The historical job remains SUCCEEDED with result:null/discarded:true. Repeated owner deletion returns204; foreign IDs404.
GET /private-media/{id}/content -> owner-authorized output bytes locally or302 to≤5minute cloud URL; no-store. No source-purpose access.
GET /private-media/{id}/download -> owner-authorized backend attachment bytes, no-store, safe filename virtualwardrobe-preview.jpg. This preserves reliable same-origin download with cloud storage.

Saved output is copied into a saved prefix excluded from unsaved lifecycle deletion. A pending save is reserved and finalized around I/O; deletion/account deletion wins over any late copy. Source deletion follows terminal processing; unsaved output expires within24hours; explicit deletion stops URL issuance immediately and physical removal retries within24hours. Prior URLs may live until their≤5minute expiry; provider/cloud backup retention is disclosed separately.

## Private worker transport and configuration

Public API /internal and /internal/** always404. Worker serves POST /internal/jobs/{jobId}/run, body {jobId}, header X-VirtualWardrobe-Dispatch-Sequence:<positive integer>, and POST /internal/maintenance. Bearer OIDC verifies Google signature/issuer/expiry/audience APP_WORKER_URL and verified service-account email APP_TASKS_SERVICE_ACCOUNT, in addition to IAM-private Cloud Run. Local HTTP requires an explicit local-only worker token; local queue polling needs no public route.

TaskDispatcher.dispatch(UUID,int) uses deterministic job+sequence task names; duplicate delivery cannot repeat a paid claim. Domain owns attempts, retry eligibility, deadline and ledger. APP_GENERATION_CUSTOMER_DAILY_LIMIT=5, APP_GENERATION_GLOBAL_DAILY_LIMIT=100, APP_GENERATION_DAILY_BUDGET_USD=5.00, APP_GENERATION_ATTEMPT_RESERVATION_USD=0.25, APP_GENERATION_ENABLED=true. APP_GENERATION_QUALITY_REPORT is an operator-provided report path for production Google and is unset by development. The report must approve the same provider/model and the40-pair human threshold; fixture tests never produce it. Demo Google is explicitly EVALUATION_DEMO with this gate pending.
