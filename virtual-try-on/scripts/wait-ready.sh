#!/usr/bin/env bash
set -euo pipefail
for attempt in $(seq 1 120); do
  if curl -fsS "http://localhost:${API_PORT:-8080}/actuator/health/readiness" >/dev/null 2>&1 && curl -fsS "http://localhost:${WEB_PORT:-5173}/" >/dev/null 2>&1; then
    printf 'Customer storefront: http://localhost:%s\nStore workspace: http://localhost:%s/staff\nAPI health: http://localhost:%s/api/v1/health\n' "${WEB_PORT:-5173}" "${WEB_PORT:-5173}" "${API_PORT:-8080}"
    exit 0
  fi
  sleep 2
done
echo 'Services did not become ready. Inspect docker compose logs api web db.' >&2
exit 1
