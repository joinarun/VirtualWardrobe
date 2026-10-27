#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
python3 -m unittest discover -s scripts/tests -p 'test_*.py'
./scripts/wait-ready.sh
# Readiness comes from make dev's packaged runtime; do not recompile a concurrently edited working tree.
BOOTSTRAP_SKIP_PACKAGE=true ./scripts/bootstrap-admin.sh
# Use the reviewed standalone CLI and the same packaged build. It never invokes a provider.
e2e_demo_dataset="${E2E_DEMO_DATASET:-virtualwardrobe-demo-v1}"
export DEMO_CREDENTIALS_FILE="${E2E_DEMO_CREDENTIALS_FILE:-$PWD/work/demo/demo-credentials-$e2e_demo_dataset.json}"
DATASET="$e2e_demo_dataset" PROFILE=standard DEMO_SKIP_PACKAGE=true ./scripts/demo.sh seed
bootstrap_directory="${BOOTSTRAP_OUTPUT_DIRECTORY:-$PWD/work}"
e2e_state_directory="${E2E_STATE_DIRECTORY:-$PWD/work/e2e}"
mkdir -p "$e2e_state_directory"
if [ -L "$e2e_state_directory" ]; then
  echo 'E2E state must be a real owner-only directory, not a symlink.' >&2
  exit 1
fi
chmod 700 "$e2e_state_directory"
e2e_bootstrap_file="${E2E_BOOTSTRAP_FILE:-$bootstrap_directory/bootstrap-credentials.txt}"
if [ ! -f "$e2e_bootstrap_file" ] && [ -f "$e2e_state_directory/admin-credential.json" ]; then
  # A verified current fixture is sufficient on later runs even if its initial temporary credential was removed.
  e2e_bootstrap_file="$e2e_state_directory/unused-bootstrap-input.txt"
  : > "$e2e_bootstrap_file"
fi
if [ ! -f "$e2e_bootstrap_file" ] || [ -L "$e2e_bootstrap_file" ]; then
  echo 'Full E2E needs the current protected operator fixture or an initial bootstrap file. Existing unknown credentials are never reset. Use make e2e-clean for a disposable isolated database.' >&2
  exit 1
fi
chmod 600 "$e2e_bootstrap_file"
export E2E_BOOTSTRAP_FILE="$e2e_bootstrap_file"
export E2E_STATE_DIRECTORY="$e2e_state_directory"
export E2E_DEMO_CREDENTIALS_FILE="$DEMO_CREDENTIALS_FILE"
docker compose build e2e
docker compose run --rm --no-deps e2e "$@"
