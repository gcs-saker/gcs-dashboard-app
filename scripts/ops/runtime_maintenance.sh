#!/usr/bin/env bash
set -euo pipefail

deployment_target="${DEPLOYMENT_TARGET:-server01-production}"
project_name="${COMPOSE_PROJECT_NAME:-gcs-saker-m2-production}"
retention_days="${TELEMETRY_RETENTION_DAYS:-30}"

[[ "${deployment_target}" == "server01-production" ]] || {
  echo "unsupported deployment target: ${deployment_target}" >&2
  exit 2
}
[[ "${project_name}" == "gcs-saker-m2-production" ]] || {
  echo "unexpected Compose project: ${project_name}" >&2
  exit 2
}
[[ "${retention_days}" =~ ^[1-9][0-9]*$ ]] || {
  echo "TELEMETRY_RETENTION_DAYS must be a positive integer" >&2
  exit 2
}

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOYMENT_TARGET="${deployment_target}" \
COMPOSE_PROJECT_NAME="${project_name}" \
  bash "${root}/scripts/ops/prune_deployment_artifacts.sh"

redis_container="${project_name}-redis-1"
redis_summary="$({
  docker exec "${redis_container}" sh -lc '
    REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli --no-auth-warning --raw EVAL "
      local cursor = \"0\"
      local total = 0
      local expiring = 0
      local persistent = 0
      repeat
        local result = redis.call(\"SCAN\", cursor, \"COUNT\", 500)
        cursor = result[1]
        for _, key in ipairs(result[2]) do
          total = total + 1
          if redis.call(\"PTTL\", key) < 0 then
            persistent = persistent + 1
          else
            expiring = expiring + 1
          end
        end
      until cursor == \"0\"
      return {total, expiring, persistent}
    " 0
  '
} 2>/dev/null)"
mapfile -t redis_counts <<<"${redis_summary}"
printf 'redis_keys_total=%s expiring=%s persistent=%s\n' \
  "${redis_counts[0]:-unknown}" "${redis_counts[1]:-unknown}" "${redis_counts[2]:-unknown}"

postgres_container="${project_name}-postgres-geo-1"
docker exec "${postgres_container}" sh -lc \
  'psql --no-psqlrc --tuples-only --no-align -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "SELECT * FROM prune_telemetry_history('"${retention_days}"');"' \
  | sed 's/^/telemetry_pruned=/'
