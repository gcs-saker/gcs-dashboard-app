#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
deployment_target="${DEPLOYMENT_TARGET:?Set DEPLOYMENT_TARGET=server01-production}"
project_name="${COMPOSE_PROJECT_NAME:-gcs-saker-m2-production}"
compose_file="${COMPOSE_FILE:-${root}/deploy/compose/compose.single-node.poc.yml}"
env_file="${ENV_FILE:?Set ENV_FILE to the private deployment environment file}"
backup_evidence="${GCS_DB_BACKUP_EVIDENCE:?Set GCS_DB_BACKUP_EVIDENCE to verified backup evidence}"

[[ "${deployment_target}" == "server01-production" ]] || { echo "only Server-01 production is managed" >&2; exit 2; }
[[ "${project_name}" == "gcs-saker-m2-production" ]] || { echo "invalid production project name" >&2; exit 2; }
[[ "${compose_file}" = /* && -f "${compose_file}" && "${env_file}" = /* && -f "${env_file}" ]] || {
  echo "canonical Compose and environment files are required" >&2; exit 2;
}
[[ "${GCS_MAINTENANCE_WINDOW_APPROVED:-0}" == "1" ]] || { echo "approved maintenance window is required" >&2; exit 2; }
PYTHONPATH="${root}/scripts/ops" python3 -c \
  'from datetime import datetime,timezone; from pathlib import Path; from telemetry_backfill_safety import verify_backup; import sys; verify_backup(Path(sys.argv[1]),datetime.now(timezone.utc))' \
  "${backup_evidence}"

compose=(docker compose --project-name "${project_name}" --env-file "${env_file}" -f "${compose_file}")
container="$("${compose[@]}" ps -q postgres-geo)"
[[ -n "${container}" ]] || { echo "postgres-geo container is unavailable" >&2; exit 2; }
[[ "$(docker inspect --format '{{.State.Health.Status}}' "${container}")" == "healthy" ]] || {
  echo "postgres-geo container is not healthy" >&2; exit 2;
}

remote_dir="$(docker exec "${container}" mktemp -d /tmp/gcs-retention.XXXXXX)"
cleanup() {
  case "${remote_dir}" in /tmp/gcs-retention.[A-Za-z0-9]*) docker exec "${container}" rm -rf -- "${remote_dir}" >/dev/null 2>&1 || true ;; esac
}
trap cleanup EXIT
docker cp "${root}/deploy/postgres/bounded_retention_runner.sh" "${container}:${remote_dir}/runner.sh"
docker cp "${root}/deploy/postgres/init/migrations/V001__retention_time_index.sql" "${container}:${remote_dir}/migration.sql"
docker exec \
  -e GEO_MIGRATION_FILE="${remote_dir}/migration.sql" \
  -e GEO_RETENTION_DAYS="${TELEMETRY_RETENTION_DAYS:-30}" \
  -e GEO_RETENTION_BATCH_SIZE="${GEO_RETENTION_BATCH_SIZE:-1000}" \
  -e GEO_RETENTION_MAX_BATCHES="${GEO_RETENTION_MAX_BATCHES:-100}" \
  -e GEO_RETENTION_BUDGET_SECONDS="${GEO_RETENTION_BUDGET_SECONDS:-300}" \
  "${container}" bash "${remote_dir}/runner.sh"
