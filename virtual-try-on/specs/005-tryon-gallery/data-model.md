# Data model

- vw_private_media: owner, purpose SOURCE/OUTPUT, status AUTHORIZED/UPLOADING/UPLOADED/PROCESSING/ACTIVE/SAVING/SAVED/DELETED/REJECTED; raw/content/pending saved keys, MIME/size/dimensions, consent/product/job references, expiry, saving-start/deletion timestamps and dataset ID. Only owner-authorized private routes expose ACTIVE/SAVED output. Source photos have no read route.
- vw_tryon_consent: immutable owner/version/provider/model/location/notice and affirmative adult/self/provider flags with timestamp.
- vw_tryon_job: owner/product/source, immutable product/garment-reference snapshot and idempotency key/fingerprint, state, deadline, dispatch sequence, claim token, attempts, refund flag, output ID, safe error, provider/model/mode, timestamps and deletion tombstone.
- vw_tryon_attempt: job/sequence, execution token, reserved USD, provider-start/finish and outcome NOT_STARTED/STARTED/CONFIRMED/RETRYABLE/REJECTED/UNKNOWN_OUTCOME; observed estimated USD/token counts. No photo bytes or contact details.
- vw_generation_day: UTC day, accepted requests, reserved/committed conservative spend and observed estimated usage.
- vw_customer_generation_day: owner/day allowance used; account lock serializes mutation and gallery count.
- vw_task_delivery: job/sequence durable local queue with processed timestamp. Cloud Tasks uses the same deterministic job/sequence identity.

All records include dataset_id for later controlled demo seeding. Jobs retain product/store/title/SKU/price snapshots; gallery survival does not depend on current public visibility. Private media is deliberately separate from catalog media and cannot gain public access from product/brand/store associations.
