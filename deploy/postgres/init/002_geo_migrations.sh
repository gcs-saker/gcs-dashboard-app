#!/usr/bin/env bash
set -euo pipefail

migration_dir="${GEO_MIGRATION_DIR:-/docker-entrypoint-initdb.d/migrations}"
statement_timeout_ms="${GEO_MIGRATION_STATEMENT_TIMEOUT_MS:-1800000}"
lock_timeout_ms="${GEO_MIGRATION_LOCK_TIMEOUT_MS:-2000}"
minimum_free_bytes="${GEO_MIGRATION_MIN_FREE_BYTES:-134217728}"

[[ "${statement_timeout_ms}" =~ ^[1-9][0-9]*$ && "${statement_timeout_ms}" -le 3600000 ]] || {
  echo "geo migration statement timeout is invalid" >&2; exit 2;
}
[[ "${lock_timeout_ms}" =~ ^[1-9][0-9]*$ && "${lock_timeout_ms}" -le 10000 ]] || {
  echo "geo migration lock timeout is invalid" >&2; exit 2;
}
[[ "${minimum_free_bytes}" =~ ^[1-9][0-9]*$ ]] || { echo "geo migration free-space floor is invalid" >&2; exit 2; }
[[ -d "${migration_dir}" ]] || { echo "geo migration directory is unavailable" >&2; exit 2; }

export PGOPTIONS="${PGOPTIONS:-} -c statement_timeout=${statement_timeout_ms}ms -c lock_timeout=${lock_timeout_ms}ms"
psql_base=(psql --no-psqlrc --set ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}")
"${psql_base[@]}" <<'SQL'
CREATE SCHEMA IF NOT EXISTS gcs_geo;
CREATE TABLE IF NOT EXISTS gcs_geo.schema_migrations (
  version TEXT PRIMARY KEY,
  checksum_sha256 TEXT NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
REVOKE ALL ON gcs_geo.schema_migrations FROM PUBLIC;
SQL

table_bytes="$("${psql_base[@]}" --tuples-only --no-align --command="SELECT pg_total_relation_size('gcs_geo.stream_telemetry_points')")"
available_kib="$(df -Pk "${PGDATA}" | awk 'NR==2 {print $4}')"
required_bytes=$(( table_bytes / 2 + minimum_free_bytes ))
available_bytes=$(( available_kib * 1024 ))
(( available_bytes >= required_bytes )) || { echo "geo migration disk preflight failed" >&2; exit 3; }

shopt -s nullglob
migrations=("${migration_dir}"/V[0-9][0-9][0-9]__*.sql)
(( ${#migrations[@]} > 0 )) || { echo "no geo migrations found" >&2; exit 2; }

for migration in "${migrations[@]}"; do
  filename="$(basename "${migration}")"
  version="${filename%%__*}"
  checksum="$(sha256sum "${migration}" | cut -d' ' -f1)"
  {
    printf '\set migration_version %s\n' "${version}"
    printf '\set migration_checksum %s\n' "${checksum}"
    printf "SET statement_timeout='%sms'; SET lock_timeout='%sms';\n" "${statement_timeout_ms}" "${lock_timeout_ms}"
    printf "SELECT pg_advisory_lock(hashtextextended('gcs_geo_schema_migration',0));\n"
    printf "SELECT set_config('gcs.migration_version', :'migration_version', false);\n"
    printf "SELECT set_config('gcs.migration_checksum', :'migration_checksum', false);\n"
    cat <<'SQL'
DO $guard$
DECLARE existing_checksum TEXT;
BEGIN
  SELECT checksum_sha256 INTO existing_checksum FROM gcs_geo.schema_migrations
    WHERE version=current_setting('gcs.migration_version');
  IF FOUND AND existing_checksum <> current_setting('gcs.migration_checksum') THEN
    RAISE EXCEPTION 'geo migration checksum mismatch' USING ERRCODE='P7501';
  END IF;
  IF to_regclass('gcs_geo.idx_stream_telemetry_points_observed_at_id') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='gcs_geo' AND c.relname='idx_stream_telemetry_points_observed_at_id'
      AND i.indisvalid AND i.indisready
      AND pg_get_indexdef(c.oid)='CREATE INDEX idx_stream_telemetry_points_observed_at_id ON gcs_geo.stream_telemetry_points USING btree (observed_at, id)'
  ) THEN
    RAISE EXCEPTION 'geo migration index is invalid or incompatible' USING ERRCODE='P7502';
  END IF;
END;
$guard$;
SQL
    cat "${migration}"
    cat <<'SQL'
DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='gcs_geo' AND c.relname='idx_stream_telemetry_points_observed_at_id'
      AND i.indisvalid AND i.indisready
  ) THEN RAISE EXCEPTION 'geo migration index verification failed' USING ERRCODE='P7503'; END IF;
END;
$verify$;
INSERT INTO gcs_geo.schema_migrations(version,checksum_sha256)
VALUES (current_setting('gcs.migration_version'),current_setting('gcs.migration_checksum'))
ON CONFLICT(version) DO NOTHING;
SELECT pg_advisory_unlock(hashtextextended('gcs_geo_schema_migration',0));
SQL
  } | "${psql_base[@]}"
done

echo "geo schema migrations applied"
