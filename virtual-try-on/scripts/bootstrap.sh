#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v docker >/dev/null || ! docker info >/dev/null 2>&1; then
  echo 'Docker is unavailable. Start Docker Desktop or your Docker engine and retry make bootstrap.' >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo 'Docker Compose v2 is required.' >&2
  exit 1
fi
if [ ! -f .env ]; then
  umask 077
  secret=$(openssl rand -hex 24)
  cat > .env <<CONFIG
POSTGRES_DB=virtualwardrobe
POSTGRES_USER=virtualwardrobe
POSTGRES_PASSWORD=$secret
CONFIG
  chmod 600 .env
fi
mkdir -p work
chmod 700 work
chmod +x services/backend/mvnw
docker compose config --quiet
docker compose build api web
printf '%s\n' 'Local configuration prepared. Run make dev.'
