# Enquiry data model

vw_enquiry stores immutable product snapshot, customer/store/product IDs, contact-sharing version/timestamp/promised retention days/name/unverified phone, status, current assignee, close outcome/timestamp, contact-state/redaction timestamp, created/updated timestamps and dataset ID. Partial unique index(customer_id,product_id,store_id) WHERE status<>'CLOSED' is authoritative.

vw_enquiry_event stores monotonic ordered ID, enquiry ID, actor ID, server-chosen visibility/type, optional plain text, from/to assignee and status, outcome, redacted flag, timestamp and dataset ID. Append-only operations preserve attribution; privacy redaction is the explicit exception that removes free text while retaining operational fields. No customer image/media reference is stored.

Account deletion redacts every linked enquiry regardless of current status. Closed retention only scrubs still-CLOSED due records after acquiring current locks. Membership/disablement events unassign active cases but preserve historical worker IDs.
