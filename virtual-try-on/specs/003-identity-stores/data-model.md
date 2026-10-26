# Identity and store records

account: UUID id, kind CUSTOMER/WORKFORCE, name(max120), normalized_identifier unique per kind, password_hash, enabled, super_admin, password_change_required, temp_password_expires_at, created_at, deleted_at, dataset_id. Only workforce may be super_admin. Customer phone is normalized E164 and unverified.
recovery_code:UUID id,account_id,code_hash unique,used_at. Never plaintext.
store:UUID id,name(max120),description(max4000),logo_url(max2000),contact_phone,status PENDING/ACTIVE/ARCHIVED,created_at,dataset_id.
store_membership:UUID id,store_id,account_id,role STORE_ADMIN/STAFF,state INVITED/ACTIVE/REMOVED,invited_by,accepted_at,unique(store_id,account_id),dataset_id.
audit_event:UUID id,actor_id,store_id,event_type,subject_id,created_at; append-only app operations, no secrets/contact payloads.
auth_rate_limit:key_hash primarykey,window_start,attempts. administration_guard singleton id1.
Spring Session JDBC tables use UUID string session IDs, bytea attributes and principal_name account UUID.

Account disabled/deleted is rejected on every service lookup even if a stale session exists. Removing a membership preserves its row with REMOVED state. Invitation acceptance requires same account and completed password rotation. Store activation requires an enabled active accepted STORE_ADMIN under its store row lock.
