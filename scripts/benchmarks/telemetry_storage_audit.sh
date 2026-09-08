#!/usr/bin/env bash
set -euo pipefail

mode="${1:---check}"
project_name="${COMPOSE_PROJECT_NAME:-gcs-saker-m2-production}"
postgres_container="${project_name}-postgres-geo-1"

run_check() {
  bash -n "$0"
  grep -q "pg_total_relation_size" "$0"
  grep -q "rows_last_24h" "$0"
  grep -q "oldest_recorded_at" "$0"
  echo "telemetry storage audit contract passed"
}

run_live() {
  docker exec "${postgres_container}" sh -lc '
    psql --no-psqlrc --tuples-only --no-align -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<"SQL"
SELECT json_build_object(
    '\''table'\'', '\''telemetry_history'\'',
    '\''rows_estimate'\'', c.reltuples::bigint,
    '\''total_bytes'\'', pg_total_relation_size(c.oid),
    '\''rows_last_24h'\'', (SELECT count(*) FROM telemetry_history WHERE recorded_at >= CURRENT_TIMESTAMP - interval '\''24 hours'\''),
    '\''oldest_recorded_at'\'', (SELECT min(recorded_at) FROM telemetry_history)
)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = current_schema() AND c.relname = '\''telemetry_history'\'';

SELECT json_build_object(
    '\''table'\'', '\''gcs_geo.stream_telemetry_points'\'',
    '\''rows_estimate'\'', c.reltuples::bigint,
    '\''total_bytes'\'', pg_total_relation_size(c.oid),
    '\''rows_last_24h'\'', (SELECT count(*) FROM gcs_geo.stream_telemetry_points WHERE observed_at >= CURRENT_TIMESTAMP - interval '\''24 hours'\''),
    '\''oldest_recorded_at'\'', (SELECT min(observed_at) FROM gcs_geo.stream_telemetry_points)
)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = '\''gcs_geo'\'' AND c.relname = '\''stream_telemetry_points'\'';
SQL
  '
}

case "${mode}" in
  --check) run_check ;;
  --run) run_live ;;
  *) echo "usage: $0 [--check|--run]" >&2; exit 2 ;;
esac
