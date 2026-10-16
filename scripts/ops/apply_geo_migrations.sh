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
[[ "${compose_file}" = /* && -f "${compose_file}" ]] || { echo "COMPOSE_FILE must be an existing absolute path" >&2; exit 2; }
[[ "${env_file}" = /* && -f "${env_file}" ]] || { echo "ENV_FILE must be an existing absolute path" >&2; exit 2; }
[[ "${GCS_MAINTENANCE_WINDOW_APPROVED:-0}" == "1" ]] || { echo "approved maintenance window is required" >&2; exit 2; }
PYTHONPATH="${root}/scripts/ops" python3 -c \
  'from datetime import datetime,timezone; from pathlib import Path; from telemetry_backfill_safety import verify_backup; import sys; verify_backup(Path(sys.argv[1]),datetime.now(timezone.utc))' \
  "${backup_evidence}"

compose=(docker compose --project-name "${project_name}" --env-file "${env_file}" -f "${compose_file}")
container="$("${compose[@]}" ps -q postgres-geo)"
[[ -n "${container}" ]] || { echo "postgres-geo container is unavailable" >&2; exit 2; }
status="$(docker inspect --format '{{.State.Health.Status}}' "${container}")"
[[ "${status}" == "healthy" ]] || { echo "postgres-geo container is not healthy" >&2; exit 2; }

remote_dir="$(docker exec "${container}" mktemp -d /tmp/gcs-geo-migrations.XXXXXX)"
cleanup() {
  case "${remote_dir}" in /tmp/gcs-geo-migrations.[A-Za-z0-9]*) docker exec "${container}" rm -rf -- "${remote_dir}" >/dev/null 2>&1 || true ;; esac
}
trap cleanup EXIT
docker cp "${root}/deploy/postgres/init/002_geo_migrations.sh" "${container}:${remote_dir}/runner.sh"
docker cp "${root}/deploy/postgres/init/migrations" "${container}:${remote_dir}/migrations"
docker exec \
  -e GEO_MIGRATION_DIR="${remote_dir}/migrations" \
  -e GEO_MIGRATION_STATEMENT_TIMEOUT_MS="${GEO_MIGRATION_STATEMENT_TIMEOUT_MS:-1800000}" \
  -e GEO_MIGRATION_LOCK_TIMEOUT_MS="${GEO_MIGRATION_LOCK_TIMEOUT_MS:-2000}" \
  -e GEO_MIGRATION_MIN_FREE_BYTES="${GEO_MIGRATION_MIN_FREE_BYTES:-134217728}" \
  "${container}" bash "${remote_dir}/runner.sh"
