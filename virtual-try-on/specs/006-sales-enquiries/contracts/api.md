# Sales enquiry API contract

All paths use /api/v1 and existing session/CSRF/problem responses. Customer private IDs return404 for foreign/workforce/anonymous readers. Store paths enforce current scope. No image/preview IDs, URLs or attachments are accepted or returned.

## Shapes

ProductSnapshot={id,title,sku,storeId,storeName,price:string,currency:'INR'}.
Contact={name:string,phone:string|null,phoneVerified:false,state:'AVAILABLE'|'REMOVED_ACCOUNT'|'EXPIRED'}.
Assignee={id:string,name:string}.
Status=NEW|OPEN|IN_PROGRESS|AWAITING_CUSTOMER_RESPONSE|CUSTOMER_REPLIED|CLOSED.
Outcome=CONTACTED|CONVERTED|NOT_INTERESTED|UNREACHABLE.

Enquiry={id,product:ProductSnapshot,contact:Contact,status:Status,outcome:Outcome|null,createdAt,updatedAt,closedAt:string|null,contactRemovedAt:string|null,canReply:boolean,events?:Event[]}.
StaffEnquiry extends Enquiry with assignee:Assignee|null,canClaim:boolean,canAssign:boolean,canChangeStatus:boolean,canReopen:boolean,canAddNote:boolean.
Lists omit events; detail/mutation responses include chronological events.
Event={id:number,type:string,actor:{name:string,kind:'CUSTOMER'|'WORKFORCE'|'SYSTEM',id?:string|null},text:string|null,redacted:boolean,createdAt,fromStatus?:Status|null,toStatus?:Status|null,outcome?:Outcome|null}.
Staff events additionally expose visibility:'PUBLIC'|'INTERNAL',fromAssignee:Assignee|null,toAssignee:Assignee|null. Customer actor IDs, assignee data, internal notes and assignment/claim events are omitted entirely. Customer event types are CREATED,STATUS_CHANGED,REOPENED,MESSAGE,CONTACT_REDACTED; server chooses visibility.

## Consent and customer flow

GET /enquiries/config -> {consent:{version:string,notice:string},limits:{noteChars:2000,messageChars:4000},outcomes:Outcome[]}.
Notice identifies sharing the authenticated name/unverified phone, product and optional note with the selected store for callback follow-up. It discloses active-case retention, account-deletion removal, and contact/text removal within the configured 180 days after closure, retaining non-identifying history. Version includes retention days; policy increases cannot extend an older consent promise. It does not share try-on photos.

POST /me/enquiries body {productId:string,consent:{version:string,shareContact:true},note?:string} -> {enquiry:Enquiry,created:boolean}. Name/phone come from the signed-in customer; the confirmation UI shows them read-only. Store is derived from the product. New requests require published AVAILABLE product/ACTIVE store. Existing active duplicate returns created:false without changing note/snapshot, even when that product subsequently becomes unavailable. New requests do not require any try-on job.

Success copy for created:true: Your request has been sent. A salesperson from this store will contact you. Duplicate copy: You already have an active enquiry for this product. Open it to continue the conversation. No response deadline promise.

GET /me/enquiries?status=&page=0&size=20 -> {items:Enquiry[],page,size,total} newest updated first.
GET /me/enquiries/{id} -> Enquiry with public events only.
POST /me/enquiries/{id}/messages body {text:string} -> Enquiry. Active plain-text reply; AWAITING_CUSTOMER_RESPONSE becomes CUSTOMER_REPLIED, other active states remain. CLOSED409 ENQUIRY_CLOSED; no auto-reopen.

## Store workflow

GET /stores/{storeId}/enquiries/counts -> {unassignedNew:number,active:number}. Refresh every 30 seconds only while visible; no external notification.
POST /stores/{storeId}/enquiries/search body {q?:string,status?:Status,assigneeId?:string,page?:number,size?:number} -> {items:StaffEnquiry[],page,size,total}. This is read-only and CSRF-protected; names/phone search stays out of request URLs/logs. The staff UI always uses this body-search route. assigneeId='unassigned' filters NULL. q searches this store's product snapshot and retained contact.
GET /stores/{storeId}/enquiries?status=&assigneeId=&q=&page=0&size=20 returns the same envelope, but q searches product title/SKU only and must never be used for contact search.
GET /stores/{storeId}/enquiries/{id} -> StaffEnquiry with all events. GET/list/counts NEVER claim or change updatedAt/history.
GET /stores/{storeId}/assignees -> existing {items:[{userId,name,role}]} of enabled accepted ACTIVE workforce members.
POST /stores/{storeId}/enquiries/{id}/claim body{} -> StaffEnquiry. NEW unassigned becomes OPEN assigned to current eligible member. Same winner retry returns current detail without a new event. Other winner409 ENQUIRY_ALREADY_CLAIMED; reload GET to see authoritative assignee. Global admin without accepted membership cannot auto-claim:409 CLAIM_MEMBERSHIP_REQUIRED, but may explicitly assign an eligible member.
PATCH /stores/{storeId}/enquiries/{id}/assignment body {assigneeId:string,reason?:string} -> StaffEnquiry. Eligible same-store enabled workforce only; first assignment opens NEW. Closed assignment requires reopen. Same assignee is idempotent. Optional reason≤1000chars is an internal event.
POST /stores/{storeId}/enquiries/{id}/status body {status:Status,outcome?:Outcome,reason?:string} -> StaffEnquiry. Use the PRD transition map below. reason≤2000chars is CUSTOMER-VISIBLE; UI must label that. Closing requires an outcome; same current status is an idempotent read without event. NEW must be claimed/assigned first.
POST /stores/{storeId}/enquiries/{id}/reopen body {assigneeId:string,reason:string} -> StaffEnquiry. CLOSED→OPEN, reason required/customer-visible≤2000chars and eligible assignee required. A different active enquiry for that customer/product/store blocks409 ACTIVE_ENQUIRY_EXISTS. Redacted contact blocks409 CONTACT_REMOVED.
POST /stores/{storeId}/enquiries/{id}/messages body {text:string} -> StaffEnquiry; public reply, active case only.
POST /stores/{storeId}/enquiries/{id}/notes body {text:string} -> StaffEnquiry; INTERNAL note, may document a closed case until redacted. Public/internal text limits4000chars. Closed public reply409; any text entry after redaction409 CONTACT_REMOVED.

OPEN→IN_PROGRESS|AWAITING_CUSTOMER_RESPONSE|CLOSED.
IN_PROGRESS→AWAITING_CUSTOMER_RESPONSE|CLOSED.
AWAITING_CUSTOMER_RESPONSE→IN_PROGRESS|CLOSED.
CUSTOMER_REPLIED→IN_PROGRESS|AWAITING_CUSTOMER_RESPONSE|CLOSED.
NEW→OPEN only by claim/assignment; CLOSED→OPEN only by reopen.

Every enabled scoped staff/admin can update/reassign store enquiries; operations are not restricted to the current assignee. A removed/disabled assignee's active work becomes unassigned NEW with an INTERNAL event. Global authority does not itself make a person an eligible assignee.

## Privacy and retention

Customer deletion clears contact and ALL free-text event bodies, including internal notes and status/reassignment/reopen reasons. Enum/actor/time history remains and body redacted:true indicates removed content. Active case status/history is retained for store closure; contact/text are unavailable. Closed contact redaction after APP_ENQUIRY_CONTACT_RETENTION_DAYS=180 follows the same policy. A redacted closed case cannot reopen; a still-enabled customer can deliberately submit a new request with fresh consent after closure. Existing enquiries work after product/store archival.

Do not render event text as HTML or use dangerouslySetInnerHTML. No realtime chat, attachments, preview sharing or external messaging exists in006.
