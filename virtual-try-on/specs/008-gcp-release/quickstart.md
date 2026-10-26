# Release validation sequence

Before cloud execution, finish source fixes and run the existing required PostgreSQL/backend/browser checks plus:

```bash
python3 -m unittest discover -s scripts/gcp -p 'test_*.py' -v
python3 scripts/gcp/deploy.py --project virtualtryon-511016
python3 scripts/gcp/cloud-demo.py seed --project virtualtryon-511016 --dataset virtualwardrobe-demo-v1
git diff --check
```

Root reviews/commits all release source and explicitly dispatches actual execution. Then follow docs/gcp-release-verification.md: deploy, non-destructive smoke and inventory; rotate bootstrap password; seed standard twice; actual CAPTCHA/session/CSRF/private upload+replay412; one authorized real Google async job; save/relogin/download/delete and cross-owner/store denial; complete callback/staff history. Capture no credentials/signed URLs/contact details in reports/screenshots.

Run the separate1000-product load profile, actual API/mobile scripts and separate evidenced cold start, then dry-run/execute only that load dataset cleanup. Run db-check and backup-rehearsal against the final tested JAR; compare restored migrations/counts and verify copy deletion. Apply scoped monitoring, ingest a private safe probe and record metric/incident evidence. Recheck unrelated StyleReel inventory.

Root publishes reviewed GitHub source/CI and final addresses with an acceptance matrix. Operational checks can pass independently; A7 human benchmark and statistically meaningful A9 p95 remain pending. No production promotion/quality approval is generated. Plans, unit tests and earlier provider connectivity never substitute for actual hosted results.
