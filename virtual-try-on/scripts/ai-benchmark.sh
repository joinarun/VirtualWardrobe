#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mode="${MODE:-mock}"
pairs="${PAIRS:-3}"
manifest="${MANIFEST:-/project/docs/evaluations/synthetic-manifest.json}"
max_usd="${MAX_USD:-0}"
mounts=(-v "$PWD:/project:ro" -v "$PWD/work:/project/work")
if [[ "$mode" == live ]]; then
  if [[ -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" || ! -f "$GOOGLE_APPLICATION_CREDENTIALS" ]]; then
    printf '%s\n' 'Live evaluation requires GOOGLE_APPLICATION_CREDENTIALS pointing to an authorized ADC file.' >&2
    exit 2
  fi
  mounts+=(-v "$GOOGLE_APPLICATION_CREDENTIALS:/tmp/benchmark-adc.json:ro" -e GOOGLE_APPLICATION_CREDENTIALS=/tmp/benchmark-adc.json)
fi
mkdir -p work/ai-benchmark
docker compose run --rm --no-deps api ./mvnw -B -DskipTests package >/dev/null
docker compose run --rm --no-deps "${mounts[@]}" \
  -e APP_AI_PROJECT="${APP_AI_PROJECT:-}" -e APP_AI_LOCATION="${APP_AI_LOCATION:-global}" \
  -e APP_AI_MODEL="${APP_AI_MODEL:-gemini-nano-banana-2.1}" \
  --entrypoint java api -Dloader.main=com.virtualwardrobe.ai.BenchmarkMain \
  -cp target/backend-0.0.1-SNAPSHOT.jar org.springframework.boot.loader.launch.PropertiesLauncher \
  --mode "$mode" --pairs "$pairs" --manifest "$manifest" --output /project/work/ai-benchmark \
  --max-usd "$max_usd" --attempt-bound-usd "${ATTEMPT_BOUND_USD:-0.10}"
