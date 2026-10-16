#!/usr/bin/env bash
set -euo pipefail

retention_days="${GEO_RETENTION_DAYS:-30}"
batch_size="${GEO_RETENTION_BATCH_SIZE:-1000}"
max_batches="${GEO_RETENTION_MAX_BATCHES:-100}"
budget_seconds="${GEO_RETENTION_BUDGET_SECONDS:-300}"
statement_timeout_ms="${GEO_RETENTION_STATEMENT_TIMEOUT_MS:-2000}"
lock_timeout_ms="${GEO_RETENTION_LOCK_TIMEOUT_MS:-500}"
migration_file="${GEO_MIGRATION_FILE:-/docker-entrypoint-initdb.d/migrations/V001__retention_time_index.sql}"

valid_integer() { [[ "$1" =~ ^[1-9][0-9]*$ ]]; }
if ! valid_integer "${retention_days}" || (( retention_days > 3650 )); then echo "retention days invalid" >&2; exit 2; fi
if ! valid_integer "${batch_size}" || (( batch_size > 1000 )); then echo "retention batch invalid" >&2; exit 2; fi
if ! valid_integer "${max_batches}" || (( max_batches > 10000 )); then echo "retention max batches invalid" >&2; exit 2; fi
if ! valid_integer "${budget_seconds}" || (( budget_seconds > 3600 )); then echo "retention budget invalid" >&2; exit 2; fi
if ! valid_integer "${statement_timeout_ms}" || (( statement_timeout_ms > 2000 )); then echo "retention statement timeout invalid" >&2; exit 2; fi
if ! valid_integer "${lock_timeout_ms}" || (( lock_timeout_ms > 500 )); then echo "retention lock timeout invalid" >&2; exit 2; fi
[[ -f "${migration_file}" ]] || { echo "geo migration file unavailable" >&2; exit 2; }

expected_checksum="$(sha256sum "${migration_file}" | cut -d' ' -f1)"
export PGOPTIONS="${PGOPTIONS:-} -c statement_timeout=${statement_timeout_ms}ms -c lock_timeout=${lock_timeout_ms}ms"
psql_base=(psql --no-psqlrc --quiet --tuples-only --no-align --set ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}")

history_table="$("${psql_base[@]}" --command="SELECT CASE WHEN to_regclass('gcs_geo.schema_migrations') IS NULL THEN 'missing' ELSE 'present' END")"
[[ "${history_table}" == "present" ]] || { echo "bounded retention requires qualified geo migration" >&2; exit 3; }
ready="$("${psql_base[@]}" --command="SELECT CASE WHEN EXISTS (
  SELECT 1 FROM gcs_geo.schema_migrations WHERE version='V001' AND checksum_sha256='${expected_checksum}'
) AND EXISTS (
  SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='gcs_geo' AND c.relname='idx_stream_telemetry_points_observed_at_id' AND i.indisvalid AND i.indisready
) THEN 'ready' ELSE 'blocked' END")"
[[ "${ready}" == "ready" ]] || { echo "bounded retention requires qualified geo migration" >&2; exit 3; }

anchor="$("${psql_base[@]}" --command="SELECT to_char(date_trunc('milliseconds',CURRENT_TIMESTAMP) AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')")"
started="$(date +%s)"
batches=0
history_total=0
points_total=0
zero_progress=0
more="t"

run_batch() {
  "${psql_base[@]}" --command="BEGIN;
    SET LOCAL statement_timeout='${statement_timeout_ms}ms';
    SET LOCAL lock_timeout='${lock_timeout_ms}ms';
    SELECT history_deleted||'|'||points_deleted||'|'||CASE WHEN has_more THEN 't' ELSE 'f' END
      FROM public.prune_telemetry_history_batch(${retention_days},${batch_size},TIMESTAMPTZ '${anchor}');
    COMMIT;"
}

while [[ "${more}" == "t" ]]; do
  elapsed=$(( $(date +%s) - started ))
  if (( batches >= max_batches || elapsed >= budget_seconds || zero_progress >= 3 )); then
    printf 'retention_result=PARTIAL batches=%s history_deleted=%s points_deleted=%s more=true\n' \
      "${batches}" "${history_total}" "${points_total}"
    exit 75
  fi
  response=""
  for attempt in 1 2; do
    if response="$(run_batch)"; then break; fi
    (( attempt == 2 )) && { echo "bounded retention batch failed" >&2; exit 4; }
    sleep 1
  done
  response="$(printf '%s\n' "${response}" | awk -F'|' 'NF==3 {print; exit}')"
  IFS='|' read -r history_deleted points_deleted more <<<"${response}"
  [[ "${history_deleted}" =~ ^[0-9]+$ && "${points_deleted}" =~ ^[0-9]+$ && "${more}" =~ ^[tf]$ ]] || {
    echo "bounded retention response invalid" >&2; exit 4;
  }
  history_total=$(( history_total + history_deleted ))
  points_total=$(( points_total + points_deleted ))
  batches=$(( batches + 1 ))
  if (( history_deleted + points_deleted == 0 )) && [[ "${more}" == "t" ]]; then
    zero_progress=$(( zero_progress + 1 ))
  else
    zero_progress=0
  fi
done

printf 'retention_result=COMPLETE batches=%s history_deleted=%s points_deleted=%s more=false\n' \
  "${batches}" "${history_total}" "${points_total}"
