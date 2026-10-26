#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
command_name="${1:-status}"
shift || true
if (( $# )); then echo 'Use DATASET, PROFILE, CATALOG_SIZE and DEMO_CREDENTIALS_FILE environment options.' >&2; exit 2; fi
case "$command_name" in seed|status|cleanup|cleanup-execute) ;; *) echo 'Unknown demo command.' >&2; exit 2;; esac
dataset="${DATASET:-virtualwardrobe-demo-v1}"
profile="${PROFILE:-standard}"
credential_file="${DEMO_CREDENTIALS_FILE:-$PWD/work/demo/demo-credentials-$dataset.json}"
if [[ "$credential_file" != /* ]]; then echo 'DEMO_CREDENTIALS_FILE must be absolute.' >&2; exit 2; fi
credential_dir="$(dirname "$credential_file")"
if [[ "$command_name" == seed && -L "$credential_dir" ]]; then echo 'Credential directory must not be a symlink.' >&2; exit 2; fi
if [[ "$command_name" == seed && ! -d "$credential_dir" ]]; then mkdir -p "$credential_dir"; chmod 700 "$credential_dir"; fi
docker compose up -d db >/dev/null
if [[ "${DEMO_SKIP_PACKAGE:-false}" != true ]]; then docker compose run --rm --no-deps api ./mvnw -B -DskipTests package >/dev/null; fi
python3 - <<'CHECK_JAR'
import zipfile, sys
try:
    with zipfile.ZipFile('services/backend/target/backend-0.0.1-SNAPSHOT.jar') as jar:
        present = 'BOOT-INF/classes/com/virtualwardrobe/demo/DemoMain.class' in jar.namelist()
except Exception:
    present = False
if not present:
    print('Demo CLI is absent from the packaged JAR. Run make dev or demo-seed without DEMO_SKIP_PACKAGE.', file=sys.stderr)
    sys.exit(2)
CHECK_JAR
args=("$command_name" --dataset "$dataset")
if [[ "$command_name" == seed ]]; then
 args+=(--profile "$profile" --assets /demo-assets --credentials "/demo-credentials/$(basename "$credential_file")")
 if [[ -n "${CATALOG_SIZE:-}" ]]; then args+=(--catalog-size "$CATALOG_SIZE"); fi
elif [[ "$command_name" == cleanup-execute ]]; then args=(cleanup --dataset "$dataset" --execute)
elif [[ "$command_name" == cleanup ]]; then args+=(--dry-run)
fi
docker_arguments=(run --rm --no-deps)
if [[ "$command_name" == seed ]]; then docker_arguments+=(-v "$PWD/apps/web/public/demo:/demo-assets:ro" -v "$credential_dir:/demo-credentials"); fi
docker compose "${docker_arguments[@]}" -e APP_ENVIRONMENT=local api java -Dloader.main=com.virtualwardrobe.demo.DemoMain -cp target/backend-0.0.1-SNAPSHOT.jar org.springframework.boot.loader.launch.PropertiesLauncher "${args[@]}"
