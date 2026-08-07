#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:?Set ENV_FILE to the private deployment environment file}"
EVIDENCE_DIR="${EVIDENCE_DIR:?Set EVIDENCE_DIR to an existing absolute private directory}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-gcs-saker}"
COMPOSE_FILE="${ROOT}/deploy/compose/compose.single-node.poc.yml"

[[ "${ENV_FILE}" = /* && -f "${ENV_FILE}" ]] || { echo "ENV_FILE must be an existing absolute file" >&2; exit 2; }
[[ "${EVIDENCE_DIR}" = /* && -d "${EVIDENCE_DIR}" ]] || { echo "EVIDENCE_DIR must be an existing absolute directory" >&2; exit 2; }
chmod 700 "${EVIDENCE_DIR}"

compose=(docker compose --project-name "${PROJECT_NAME}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
release_dir="${EVIDENCE_DIR}/${timestamp}"
mkdir -m 700 "${release_dir}"
database_dump="${release_dir}/database.dump"
restore_database="gcs_restore_verify_${timestamp//[^0-9]/}"

cleanup() {
  "${compose[@]}" exec -T postgres-geo sh -c \
    'dropdb --if-exists --force -U "$POSTGRES_USER" "$1"' sh "${restore_database}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${compose[@]}" exec -T postgres-geo sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "${database_dump}"
test -s "${database_dump}"
cp --preserve=mode,timestamps "${ENV_FILE}" "${release_dir}/deployment.env"
cp "${COMPOSE_FILE}" "${release_dir}/compose.single-node.poc.yml"
chmod 600 "${release_dir}/deployment.env" "${database_dump}"
"${compose[@]}" images --format json > "${release_dir}/images.json"

"${compose[@]}" exec -T postgres-geo sh -c \
  'createdb -U "$POSTGRES_USER" "$1"' sh "${restore_database}"
docker cp "${database_dump}" "$("${compose[@]}" ps -q postgres-geo):/tmp/gcs-rollback-drill.dump"
"${compose[@]}" exec -T postgres-geo sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --no-acl /tmp/gcs-rollback-drill.dump' sh "${restore_database}"

source_tables="$("${compose[@]}" exec -T postgres-geo sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from information_schema.tables where table_schema not in ('"'"'pg_catalog'"'"','"'"'information_schema'"'"')"')"
restored_tables="$("${compose[@]}" exec -T postgres-geo sh -c \
  'psql -U "$POSTGRES_USER" -d "$1" -Atc "select count(*) from information_schema.tables where table_schema not in ('"'"'pg_catalog'"'"','"'"'information_schema'"'"')"' sh "${restore_database}")"
[[ "${source_tables}" = "${restored_tables}" ]] || { echo "restore verification table count mismatch" >&2; exit 1; }

dump_sha256="$(sha256sum "${database_dump}" | cut -d' ' -f1)"
cat > "${release_dir}/drill-result.json" <<JSON
{
  "schemaVersion": 1,
  "completedAt": "${timestamp}",
  "sourceCommit": "$(git -C "${ROOT}" rev-parse HEAD)",
  "databaseDumpSha256": "${dump_sha256}",
  "sourceTableCount": ${source_tables},
  "restoredTableCount": ${restored_tables},
  "restoreVerified": true,
  "previousImagesCaptured": true,
  "composeAndEnvironmentCaptured": true
}
JSON
chmod 600 "${release_dir}/drill-result.json" "${release_dir}/images.json" "${release_dir}/compose.single-node.poc.yml"
echo "backup and rollback restore drill completed: ${release_dir}"
