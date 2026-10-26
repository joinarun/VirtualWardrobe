#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p work
docker compose up -d db >/dev/null
docker compose run --rm --no-deps api ./mvnw -B -DskipTests package >/dev/null
docker compose run --rm --no-deps -v "$PWD/work:/workspace/work" \
  -e APP_BOOTSTRAP_SUPERADMIN_EMAIL="${APP_BOOTSTRAP_SUPERADMIN_EMAIL:-superadmin_1@gmail.com}" \
  -e APP_BOOTSTRAP_SUPERADMIN_PASSWORD \
  api java -jar target/backend-0.0.1-SNAPSHOT.jar --app.command=bootstrap --server.port=0
