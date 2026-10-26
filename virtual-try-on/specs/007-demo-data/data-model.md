# Data model

vw_demo_dataset: id/profile/fingerprint/credential-file digest and paths/state/lease token+expiry/lifecycle timestamps; no credential values. vw_demo_object: globally unique object key, dataset ownership, expected content hash/MIME/size and PENDING/STORED/DELETED state. Business rows retain dataset_id; recovery codes receive the missing dataset column. No seeded live quotas/queue delivery are required because gallery jobs are terminal mock fixtures with zero cost.

Staging inserts complete relational fixtures atomically before object writes; activation changes visibility only after manifest completion. Cleanup checks every incoming actual FK plus audit subject and physical key references. Nullable cyclic pointers are cleared only on owned rows before ordered child deletion. Bootstrap/unrelated counters/sessions/data remain protected; seeded-account sessions are revoked only during authorized cleanup.
