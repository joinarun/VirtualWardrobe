#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bootstrap_directory="${BOOTSTRAP_OUTPUT_DIRECTORY:-$PWD/work}"
umask 077
mkdir -p "$bootstrap_directory"
chmod 700 "$bootstrap_directory"
docker compose up -d db >/dev/null
if [ "${BOOTSTRAP_SKIP_PACKAGE:-false}" != "true" ]; then
  docker compose run --rm --no-deps api ./mvnw -B -DskipTests package >/dev/null
fi
bootstrap_uid="$(id -u)"
bootstrap_gid="$(id -g)"
docker compose run --rm --no-deps --user "$bootstrap_uid:$bootstrap_gid" -v "$bootstrap_directory:/workspace/work" \
  -e APP_BOOTSTRAP_SUPERADMIN_EMAIL="${APP_BOOTSTRAP_SUPERADMIN_EMAIL:-superadmin_1@gmail.com}" \
  -e APP_BOOTSTRAP_SUPERADMIN_PASSWORD \
  api java "-Duser.name=$bootstrap_uid" -jar target/backend-0.0.1-SNAPSHOT.jar --app.command=bootstrap --server.port=0
