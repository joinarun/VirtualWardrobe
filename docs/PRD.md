# Virtual clothing try on product requirements

## Mobile experience amendment — approved 2026-10-27

The owner's mobile follow-up and constitution2.0.0 supersede earlier clauses requiring blocking photo-consent/age/ownership checkboxes, customer provider/model/evaluation banners and dense generation warnings. The customer path is choose saree→add photo→view Virtual preview. A deliberate request is recorded as USER_ACTION with version/time and NULL legacy attestation fields; historical legacy records stay truthful. Generic photo handling/retention is available through a passive Privacy link. Provider provenance, budgets, deployment diagnostics and production quality review stay internal/operator-facing. Existing role/privacy/retention/CSRF/quota and callback-contact boundaries remain.

Customer login persists for up to30days (30-day server idle); workforce stays8hours idle, anonymous30minutes and temporary credentials their absolute24hours. Persistent __session remains Secure/HttpOnly/Lax in GCP; no authentication secrets in localStorage. Existing pre-update cookies may need one new sign-in. Transient/offline refresh is reconnect state, not asserted logout; resume revalidates read-only work with stale-response protection.

Customer mobile screens use compact headers, safe-area bottom navigation and reachable44px actions; Pearl/Sage/Midnight/System appearances persist without first-paint flash or image recolouring. Focused browser/background/reload/race/theme/accessibility tests and actual GCP/CI evidence are required. Feature009 contains the authoritative contract and acceptance details. Android/iOS binaries and new infrastructure remain out of scope.

Version 1.0 · 26 October 2026 · Proposed Phase 1 baseline

Build a responsive web marketplace where customers discover clothing from multiple stores, preview selected garments on their own photos, and request a sales callback. Sarees are the priority category. Stores manage their catalogs and follow up on enquiries through a separate staff workspace. Android and iOS applications will use the same backend in later phases.

The defaults below resolve ambiguities in the original requirements. They are product decisions for this baseline and can be revised before implementation.

## 1 Product goals and scope

Phase 1 must deliver the complete journey from product discovery to an AI preview and a store enquiry. It must keep customer photos private, enforce store permissions on the server, and limit generation spending.

| Included in Phase 1 | Deferred |
| --- | --- |
| Responsive customer website and staff workspace | Android and iOS applications using React Native and Expo |
| Store administration, catalog, search and filtering | SMS OTP and verified phone ownership |
| AI try on, private saved gallery and deletion | Checkout, payments, shipping, returns and confirmed orders |
| Callback enquiries, assignment, history and text replies | Live inventory, recommendations and size prediction |
| In-app notification counts and enquiry lists | SMS, WhatsApp, email and mobile push notifications |
| Repeatable demo data and targeted cleanup | Video try on, live camera AR and social sharing |

The preview page purchase call to action is **Buy it**. It opens the existing store callback form and creates a sales enquiry rather than an order. Customers can request a callback without generating or saving a try-on image. Feature010 also specifies compact appearance controls, aligned catalog controls, grouped preview actions and a complete desktop sign-in photograph.

## 2 Accounts and access

### 2.1 Authentication

- Administrators and staff sign in with an email address and password. Customers sign up and sign in with a mobile number and password. Each account also has an immutable internal ID; phone numbers and email addresses are not database primary keys.
- Workforce and customer credentials are separate account types. A staff member who shops creates a customer account; their workforce role does not unlock that account or its photos. Administrative recovery can reset workforce credentials only, never customer credentials.
- Customer signup requires name, country code, mobile number, password, agreement to the privacy notice, and a CAPTCHA validated by the backend. India is the initial market; normalize numbers to international format and enforce uniqueness.
- Phone OTP is deferred. Store the phone as unverified and show that distinction on enquiries. CAPTCHA does not verify ownership of a phone number.
- At signup, issue a set of one-time recovery codes, shown once and available to download. Store only their hashes. Password recovery requires a valid unused code and invalidates existing sessions. No reset is allowed from knowledge of a phone number alone. If all codes are lost, there is no automated recovery in Phase 1; support must not grant access without independent identity evidence.
- Phone number changes are outside Phase 1 self-service. Explain the limitation at signup. An unverified number may have been entered by someone other than its owner; adding verification remains a later feature.
- New workforce accounts receive a unique temporary password through the creating administrator, expire after 24 hours, and must change it before accessing business features. Never replace an existing account's password when adding a store membership.
- Store admins manage memberships, not another user's global password. Global workforce recovery belongs to super admins through an audited reset process. A super admin cannot read existing passwords.
- Logout, password change, account disablement and recovery revoke relevant sessions. Use supported password hashing, secure sessions, rate limits and generic authentication errors.

### 2.2 Roles and scope

Super admin is a global role. Store admin and staff roles belong to a user's membership in a particular store. A person may be admin of Store A and staff of Store B. Permissions are evaluated for the requested store on every backend operation.

| Capability | Super admin | Store admin | Store staff | Customer |
| --- | --- | --- | --- | --- |
| Create stores and assign initial admins | All stores | No | No | No |
| Edit store name, logo and description | All stores | Administered stores | No | No |
| Add or remove store admin/staff memberships | All stores | Administered stores | No | No |
| Grant or revoke super admin | Yes | No | No | No |
| Manage products and store-specific brands/tags | All stores | Administered stores | Assigned stores | No |
| Manage global brands and category hierarchy | Yes | No | No | No |
| Work on enquiries and assignment | All stores | Administered stores | Assigned stores | Own enquiries and replies |
| Browse published catalog | Yes | Yes | Yes | Yes, also guests |
| Generate and manage personal try-on images | Own personal workspace | Own personal workspace | Own personal workspace | Own personal workspace |

Administrative power does not grant a customer gallery browser or customer impersonation. Personal images are available only to their owner through ordinary application APIs. Privileged cloud access is operational access and must be restricted separately.

### 2.3 Administration rules

- A bootstrap command creates exactly one initial super admin when none exists. For local/demo use, default its email to `superadmin_1@gmail.com`. Production requires an explicitly configured address controlled by the operator. Generate a one-time credential or read it from a secret; never ship a known production password.
- Super admins can create additional super admins. The final active super admin cannot be removed, disabled or demoted.
- Super admins create stores with name, logo/icon, description, contact details and PENDING, ACTIVE or ARCHIVED status. Create or activate a store together with its first active, accepted admin membership in one transaction; otherwise keep it PENDING and hidden from customers.
- A store admin can add admins and staff only to stores they administer. Existing users accept an invitation while authenticated before receiving a new membership. Creating a membership never exposes another store's membership details.
- Every active store must retain at least one active admin, including during concurrent membership changes and global account disablement. A global disablement affecting the last admin of a store requires replacement first.
- Store admins cannot create new stores, grant super admin, or change memberships in stores they do not administer. Removing a user from a store removes that membership and preserves attribution in history.
- Account disablement is distinct from membership removal. Archive stores and products rather than breaking historical enquiries. Archiving a store hides its catalog, stops new enquiries and retains existing records.
- Loss of store access takes effect on the next authorized API request. Active enquiries assigned to that person return to the unassigned NEW queue, with an audit entry.

## 3 Catalog and media

Each product belongs to exactly one store. Its minimum fields are store ID, SKU/reference unique within that store, title, description, category, optional brand, labels/tags, INR price, colour, size or free-size, availability and publication status. Use decimal money values. Inventory quantities and variant stock tracking are deferred.

- Categories form a hierarchy managed by super admins, for example Clothing → Women → Sarees. Super admins manage global brands. Admins and staff can create store-specific brands and tags, including optional logos; they cannot modify another store's definitions or global definitions.
- A draft can have no images. Publishing requires at least one valid product image. Permit up to 10 images and one optional video. Staff choose the display order, cover image and designated garment reference for try on.
- Initial limits: JPEG/PNG/WebP product images up to 10 MB each and 20 megapixels; one MP4 video up to 50 MB and 30 seconds. Validate actual content, dimensions and duration on the backend. Reject unsupported or corrupt files. Strip image metadata and create thumbnails. These limits are configurable.
- Only validated media can be published or sent to a model. Convert garment references to the selected provider's supported format. Videos are catalog content and never model inputs in Phase 1.
- Products have DRAFT, PUBLISHED and ARCHIVED states; availability is AVAILABLE or UNAVAILABLE. Public search includes published products from active stores. Unavailable products remain browsable with generation/callback actions disabled.
- Search covers product title, description, brand and labels. Provide category, store, brand, price and label filters, pagination, and newest/price sorting. Start with database search; do not introduce a separate search cluster.
- Archived products disappear from discovery. Existing enquiries preserve a product snapshot and still open normally. Saved previews remain visible to their owners even when a product becomes unavailable, with its current availability explained.

## 4 Customer experience and virtual try on

### 4.1 Customer interface

Use an original visual design with familiar fashion-shopping patterns: clear search, image-led product cards, useful filters, product galleries, visible price and store identity, and a prominent **Try it on me** action. Treat Myntra, AJIO and Nykaa Fashion as references for shopping patterns, and TryTheClothes and FitRoom as references for photo-selection and result flows. Do not copy branding, layouts or unlicensed assets.

The customer interface and staff workspace have separate navigation and layouts. The staff workspace includes a store selector limited to authorized memberships. Explain unavailable actions and validation errors in plain language.

### 4.2 Generation flow

1. A guest browses products; authentication is required to generate, save previews or submit enquiries.
2. The customer selects an available, try-on-enabled product and chooses **Try it on me**.
3. Show full-body capture guidance: one person, front-facing, good lighting, unobstructed clothing, and a clear background. Offer camera capture when the browser supports it and a file-upload fallback.
4. Before upload, obtain consent to process the image with the identified AI provider and disclose retention. Phase 1 accepts adults uploading their own photos; no third-party or children's photos.
5. Accept one JPEG or PNG up to 10 MB and 20 megapixels. Validate content and strip metadata. Explain rejections without repeatedly sending invalid files to the provider.
6. Create a persistent generation job and show QUEUED, RUNNING, SUCCEEDED, FAILED, EXPIRED or CANCELLED. Customers can leave and return to job status. Show real states, without fabricated percentage progress.
7. Produce one output per request by default. Display: **AI-generated preview. Appearance, garment details and drape may differ. This is not a size or fit guarantee.**
8. Let the customer save, download or discard the result. Saving is an explicit action. A saved gallery persists across logins and supports individual deletion.
9. Show recoverable errors and a deliberate retry action. A browser refresh or duplicate submission must not create a second generation or consume a second customer allowance.

Model/provider selection is configurable behind one integration interface. Start by evaluating Google's current Nano Banana image model against any supported equivalent; select the production default from the saree benchmark rather than marketing claims. Google documents several image models for try on, but does not establish saree fidelity in that guide. [Google try-on guidance](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/generate-virtual-try-on-images).

### 4.3 Privacy and spending

- Customer source images, previews and saved images use private storage and short-lived authorized access. Staff see no customer images through enquiry tickets. Phase 1 does not attach try-on images to enquiries.
- Delete source photos after terminal job processing and no later than 24 hours after upload. Unsaved outputs expire within 24 hours. Saved outputs remain until deletion or account deletion, with an initial limit of 100 per customer.
- Discard and delete immediately prevent new application access and schedule object deletion within 24 hours. Previously issued media URLs expire within 5 minutes at most. Document cloud soft-delete/backup retention; do not describe access removal as immediate physical erasure from every backup.
- Cancellation or deletion during generation prevents a late provider response from restoring the image. Provider processing may already have begun and may remain billable.
- Record consent version, timestamp, provider/model and aggregate usage. Never log photo content, signed URLs, passwords, recovery codes or unnecessary customer identifiers. Do not promise provider retention/training terms beyond the selected service's documented terms.
- Initial configurable limits: 5 generation requests per customer per day, 100 globally per day, and a global daily provider budget of US$5. Reserve quota and estimated spend atomically before queueing. Reject new work when limits or a manual kill switch are active. Limits may be tuned after measurement.
- Refund customer allowance on terminal technical failure; reconcile provider spend independently because failed or ambiguous calls may still incur charges. Permit at most one automatic retry for a clearly retryable failure. Do not blindly retry an unknown provider outcome.

## 5 Enquiries and store follow up

### 5.1 Submission and notifications

The callback form confirms the customer's name, unverified mobile number, selected product and store, and an optional note. Obtain explicit agreement to share those details with that store. On submission, show: **Your request has been sent. A salesperson from this store will contact you.** Do not promise a response deadline before store operations define one.

Create one active enquiry per customer/product/store combination. Repeated clicks return the same enquiry; a new one may be created after closure. Preserve a snapshot of product title, reference and displayed price. Validate the product-to-store relationship on the backend.

The store workspace shows unassigned/new and total active counts, a filterable enquiry list and ticket detail. Refresh in-app counts every 30 seconds while the page is visible. Notifications in Phase 1 do not include external messages.

### 5.2 Assignment and status

Opening an unassigned enquiry's detail view triggers an explicit atomic claim request. Exactly one eligible employee wins concurrent claims; other viewers see the current assignee. List viewing never claims a ticket, and a read-only GET must not mutate assignment.

| Status | Meaning and transitions |
| --- | --- |
| NEW | Unassigned. A successful first claim moves it to OPEN. |
| OPEN | Assigned and awaiting action. Staff can move to IN_PROGRESS, AWAITING_CUSTOMER_RESPONSE or CLOSED. |
| IN_PROGRESS | Staff are following up. Can move to AWAITING_CUSTOMER_RESPONSE or CLOSED. |
| AWAITING_CUSTOMER_RESPONSE | Waiting for the customer. A customer reply changes it to CUSTOMER_REPLIED. Staff can resume or close it. |
| CUSTOMER_REPLIED | Customer replied while a response was awaited. Staff can resume IN_PROGRESS, await another response or close it. |
| CLOSED | Follow up completed, with an outcome such as contacted, converted, not interested or unreachable. Staff can reopen to OPEN with a reason and a valid assignee. |

Customers have a **My enquiries** page with their own ticket status and a simple plain-text conversation. Staff can send customer-visible replies and separate internal notes. A customer reply in other non-closed states is recorded without changing the state. Closed tickets reject new customer replies and explain how to submit another request. No attachments or realtime chat are included.

Any active staff member or store admin of the same store can receive reassignment. Authorized store employees can reassign and update tickets; every change records actor and time. Keep an append-only history of assignment, status, messages and internal notes, showing only customer-visible events to the customer. Staff have no global customer directory.

## 6 Security and operational requirements

- Enforce permissions in backend services for products, memberships, media upload/download authorization, enquiries, counts and every object reference. Hiding UI controls is insufficient.
- Use HTTPS, secure HttpOnly cookies, CSRF protection for cookie-authenticated changes, restrictive CORS, validated input and bounded uploads. Keep AI credentials and cloud secrets on the backend.
- Use separate demo and production environments, least-privilege service accounts and a private generation worker. No public buckets for customer photos.
- Use durable jobs, transactional claims, idempotent handlers, bounded timeouts, reconciliation of queue failures, and cleanup of abandoned uploads. Do not rely on a background thread surviving after an HTTP response.
- Account deletion revokes sessions and removes private gallery content. Anonymize enquiry contact details according to a documented retention policy while retaining non-identifying operational history. Initial enquiry contact retention is 180 days after closure; active enquiries remain until closure or a reviewed deletion request.
- Provide health checks, structured logs, error monitoring, database backup/restore instructions and a tested migration path. Keep the architecture small; Kubernetes, Kafka, Redis and multiple business microservices are outside the baseline.

## 7 Demo dataset

Provide seed and cleanup commands. Seeding must be repeatable, require no retailer scraping, and make no paid AI calls by default.

- At least 3 super admins, 3 store admins, 3 staff and 3 customers, with at least 3 stores and at least one admin for each active store.
- At least 30 products, including at least 24 sarees covering different fabrics, patterns and prices. Include multi-image products and one licensed video fixture. Include suitable person/garment benchmark fixtures with consent/provenance.
- Include users limited to one store and users spanning stores, plus enquiries in every supported status and reassignment histories.
- Demo generation can use deterministic fixtures clearly labelled **Demo preview**. A separate live mode calls the actual provider under quotas. Never present a fixture as an actual generated result.
- Give every seeded record and storage object a dataset ID. Cleanup offers a dry run and removes only that dataset, refuses unsafe cross-dataset references, and preserves the production bootstrap account and all unrelated records/objects. Refuse demo mutations in production.
- Generate unique demo passwords and write account details to an ignored local `demo-credentials.txt` with owner-only permissions. Never commit credentials or print them in CI logs. Demo passwords are a deliberate local testing exception, not a production credential policy.
- Use owned, licensed, permissioned or appropriately generated assets. Record source, licence and permitted usage. Retailer images require permission or a licence covering this use; describing a demo does not by itself establish permission. [Indian Copyright Act sections 51 and 52](https://copyright.gov.in/Copyright_Act_1957/chapter_xi.html).

## 8 Release acceptance

| ID | Required evidence |
| --- | --- |
| A1 | A customer completes signup → login → find a saree → generate a labelled preview → save → log in again → view/delete → request a callback. |
| A2 | Staff claim that enquiry, reply, receive a customer reply, reassign, close and inspect accurate history. |
| A3 | Direct API attempts cannot cross store boundaries or access another customer's photos, jobs or enquiries, including through guessed object IDs or media URLs. |
| A4 | Concurrent requests cannot remove the final active admin or assign one unassigned enquiry to two people. |
| A5 | Duplicate submissions/deliveries do not duplicate local jobs, successful results or enquiries; unknown provider outcomes are reconciled rather than blindly retried. |
| A6 | Technical failures release customer quota, retain billable-spend accounting, and leave no indefinitely pending jobs or orphaned photos. Deletion during generation cannot resurrect content. |
| A7 | A 40-pair consented saree benchmark covers prints, intricate borders, pallu, fabrics, body shapes and lighting. At least 80% of all pairs must score 4/5 or above on each of identity preservation, garment fidelity and believable drape, with no severe artifact. Refusals/timeouts count as failures. Record human review, p50/p95 latency and cost per accepted image. This is a proposed launch gate, not a claimed model result. |
| A8 | On the declared test environment with 1,000 catalog products and 20 concurrent users, warmed ordinary API requests meet p95 ≤ 750 ms excluding media transfer and AI calls; browse pages become usable within 3 seconds on the documented mobile-network profile. Measure cold starts separately. |
| A9 | Target p95 completed generation ≤ 90 seconds and a terminal state by 180 seconds under the documented demo load. Validate provider behavior; expose a clear failure if the deadline is exceeded. |
| A10 | Main customer and staff tasks work from 360 px mobile width through desktop, with labelled controls, keyboard navigation and accessible focus/contrast. |
| A11 | Running seed twice creates no duplicates. Cleanup dry run is accurate; cleanup preserves all pre-existing non-demo records and objects. |
| A12 | A deployed smoke test verifies real provider access, private-worker authorization, private media, quotas, restore instructions and the customer-to-store journey. |

Track discovery-to-try-on rate, generation success rate, preview-save rate, callback-request rate, time to first staff action and AI cost per accepted result. Do not send personal photos or enquiry text to analytics.

### Owner workspace issue follow-up 2026-10-31

Feature012 removes the long fictional-demo/evaluation/fit-disclaimer banner from all screens, including workforce. Internal operator evaluation evidence and small Sample labels on seeded previews remain. Membership edit controls align, Store status has accessible explanatory help reflecting current manual activation, and a clean successful product save permits selecting another product while unsaved and in-flight edits stay guarded. No provider or activation workflow changes are implied.
