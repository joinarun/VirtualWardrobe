# Evaluate without paid calls

Run `make ai-benchmark MODE=mock PAIRS=3`. Read ignored work/ai-benchmark/report.json and review.csv. All output metadata must say Demo preview and HUMAN_REVIEW_PENDING. Defaults use synthetic repository assets with documented provenance.

Run backend tests with `docker compose run --rm backend-tests`. No test calls the external provider. Tests select final non-thought images, reject malformed output, reject missing consent and reject an insufficient budget before calling a provider.

Live mode requires a consent/provenance manifest, APP_AI_PROJECT and Application Default Credentials, plus an explicit MAX_USD. Example `make ai-benchmark MODE=live PAIRS=3 MANIFEST=/workspace/work/fixtures/manifest.json MAX_USD=0.30`. The wrapper mounts only an explicitly configured ADC file when required, never prints it, and never creates service-account keys. Do not execute live runs merely to verify installation. The existing connectivity smoke is documented in docs/evaluations/connectivity.md.
