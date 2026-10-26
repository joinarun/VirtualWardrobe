# Evaluation data

Manifest: assetRoot, source, license, permittedUsage, consentRecorded boolean, synthetic boolean, and pairs. Each pair has unique nonblank id, person path and garment path. Real files must resolve beneath assetRoot after symlink resolution. Pair count is positive and at most the number of available pairs.

GenerationRequest: person/garment image byte arrays and MIME values, plus bounded application prompt. GenerationResult: final bytes, MIME, provider/model, demo flag, reported or estimated USD cost and usage counts. No record logs its bytes or token.

Evaluation report: run mode, model, pair count, successful/failed counts, per-pair outcome/latency/estimated billed spend, timing percentiles, total spend, and HUMAN_REVIEW_PENDING. Human review sheet has blank identity/garment/drape scores and severe-artifact/refusal fields. No automatic human acceptance is generated. Files stay in ignored work storage.
