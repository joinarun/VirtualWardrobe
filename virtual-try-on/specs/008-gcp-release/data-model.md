# Release data and lifecycle

No new business aggregate is introduced. V10 adds nullable catalog/upload cleanup enqueue timestamps, preserving V1–V9 and reusing the durable storage-delete task table. Candidate rows retain their original owner/store/dataset identity. Marker/queue transitions are atomic; a failed delete stays retryable and a known late writer must rearm cleanup without touching a retained/live key. PREPARING/DELETING dataset work is excluded from ordinary maintenance. Exact SQL names, indexes and claim conditions are domain-owned under FR-009.

Release inventory: exact project/region/resource names, full source revision, immutable image identifier, service URLs, Hosting site, public CAPTCHA key, runtime limits and nonsecret verification timestamps. Status distinguishes provisioned-not-deployed from deployed/verified. Secret values never enter this inventory.

Failure event: boolean vw_failure=true, stable allowlisted code, optional random job ID/aggregate counts. No exception/cause text, private media, URL, phone/email, credential, message body or request payload. Monitoring filters only the two application services.

Verification receipt: check name, environment/revision, timestamps, pass/fail/blocked/unrun, aggregate counts/timings and evidence paths. Synthetic provider smoke is operational evidence only. Performance records sample count/profile/warm versus observed-first timing; only startup logs justify a cold-start label. Backup receipts retain source backup ID, fresh isolated target, migration/JAR fingerprints/counts and cleanup state, with no database password.

Bootstrap account is not dataset-owned. Standard and load data keep separate versioned dataset manifests and owner-only credential files. Cleanup never adopts runtime rows or the bootstrap account; tombstoned IDs need a new explicit version. Temporary restore instances have random strict owned names and must reach DELETED before the rehearsal can count as passed.
