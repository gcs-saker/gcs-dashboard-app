#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="check"
EDGE_BASE_URL="${EDGE_BASE_URL:-https://a4ai.tplinkdns.com}"
STREAM_PATH="${STREAM_PATH:-raw/nat/soak}"
STUN_URL="${STUN_URL:-stun:a4ai.tplinkdns.com:3478}"
TURN_PRIMARY_URL="${TURN_PRIMARY_URL:-turn:a4ai.tplinkdns.com:3478?transport=udp}"
TURN_SECONDARY_URL="${TURN_SECONDARY_URL:-turn:a4ai.tplinkdns.com:3479?transport=udp}"
TURN_USERNAME="${TURN_USERNAME:-${WEBRTC_TURN_USERNAME:-}}"
TURN_PASSWORD="${TURN_PASSWORD:-${WEBRTC_TURN_PASSWORD:-}}"
RELAY_ONLY="${RELAY_ONLY:-0}"
RUN_TURN_ALLOCATIONS="${RUN_TURN_ALLOCATIONS:-1}"
INSECURE_TLS="${INSECURE_TLS:-1}"
SOAK_DURATION_SECONDS="${SOAK_DURATION_SECONDS:-1800}"
SOAK_SAMPLE_INTERVAL_SECONDS="${SOAK_SAMPLE_INTERVAL_SECONDS:-60}"
SOAK_PUBLISH_FPS="${SOAK_PUBLISH_FPS:-15}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-15}"
REPORT_FILE="${REPORT_FILE:-}"
SERVER_SSH_TARGET="${SERVER_SSH_TARGET:-}"
SERVER_SSH_PORT="${SERVER_SSH_PORT:-22}"
SERVER_METRICS_PATTERN="${SERVER_METRICS_PATTERN:-mediamtx|turn|edge|backend|media-control|redis|postgres}"
SERVER_DOCKER_COMMAND="${SERVER_DOCKER_COMMAND:-docker}"
PUBLISHER_PID=""

usage() {
  cat <<'EOF'
Usage:
  scripts/m7_streaming_stability_soak.sh [--check|--run]

Modes:
  --check  Validate soak contracts without network calls.
  --run    Keep one WHIP publisher open and sample WHEP first-frame stability.

Environment:
  EDGE_BASE_URL                 Default: https://a4ai.tplinkdns.com
  STREAM_PATH                   Default: raw/nat/soak
  STUN_URL                      Default: stun:a4ai.tplinkdns.com:3478
  TURN_PRIMARY_URL              Default: turn:a4ai.tplinkdns.com:3478?transport=udp
  TURN_SECONDARY_URL            Default: turn:a4ai.tplinkdns.com:3479?transport=udp
  TURN_USERNAME                 Defaults to WEBRTC_TURN_USERNAME
  TURN_PASSWORD                 Defaults to WEBRTC_TURN_PASSWORD
  RELAY_ONLY                    Default: 0. Set 1 to use TURN primary for media.
  RUN_TURN_ALLOCATIONS          Default: 1
  SOAK_DURATION_SECONDS         Default: 1800. 30-minute baseline.
  SOAK_SAMPLE_INTERVAL_SECONDS  Default: 60
  SERVER_SSH_TARGET             Optional user@host for docker stats sampling.
  SERVER_SSH_PORT               Default: 22
  SERVER_DOCKER_COMMAND         Default: docker. Use "sudo docker" when SSH user needs sudo.
  REPORT_FILE                   Optional path to write the same report output.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      MODE="check"
      shift
      ;;
    --run)
      MODE="run"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 127
  fi
}

now_ms() {
  python3 -c 'import time; print(int(time.time() * 1000))'
}

tls_args() {
  if [[ "$INSECURE_TLS" == "1" ]]; then
    printf '%s\n' "-k"
  fi
}

append_report() {
  local line="$1"
  echo "$line"
  if [[ -n "$REPORT_FILE" ]]; then
    printf '%s\n' "$line" >>"$REPORT_FILE"
  fi
}

curl_status() {
  local url="$1"
  # shellcheck disable=SC2046
  curl $(tls_args) -s -o /dev/null -w "%{http_code}" "$url"
}

run_turn_allocation() {
  local label="$1"
  local turn_url="$2"
  local started
  local finished
  started="$(now_ms)"
  python3 "${REPO_ROOT}/scripts/turn_relay_smoke.py" \
    --run \
    --turn-url "$turn_url" \
    --username "$TURN_USERNAME" \
    --password "$TURN_PASSWORD" \
    --timeout-seconds "$TIMEOUT_SECONDS" >/tmp/gcs-saker-turn-soak.out 2>&1
  finished="$(now_ms)"
  append_report "${label} allocation latency ms: $((finished - started))"
  sed 's/^/  /' /tmp/gcs-saker-turn-soak.out | while IFS= read -r line; do append_report "$line"; done
}

sample_server_metrics() {
  local sample="$1"
  if [[ -z "$SERVER_SSH_TARGET" ]]; then
    append_report "sample ${sample} server metrics: skipped (SERVER_SSH_TARGET not set)"
    return
  fi
  append_report "sample ${sample} server metrics:"
  ssh -p "$SERVER_SSH_PORT" "$SERVER_SSH_TARGET" \
    "${SERVER_DOCKER_COMMAND} stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}} net={{.NetIO}}' | grep -E '${SERVER_METRICS_PATTERN}' || true" \
    2>&1 | sed 's/^/  /' | while IFS= read -r line; do append_report "$line"; done
  ssh -p "$SERVER_SSH_PORT" "$SERVER_SSH_TARGET" \
    "${SERVER_DOCKER_COMMAND} ps --format '{{.Names}} status={{.Status}}' | grep -E '${SERVER_METRICS_PATTERN}' || true" \
    2>&1 | sed 's/^/  /' | while IFS= read -r line; do append_report "$line"; done
}

run_check() {
  bash -n "$0"
  grep -q "SOAK_DURATION_SECONDS" "$0"
  grep -q "disconnect events" "$0"
  grep -q "reconnect successes" "$0"
  grep -q "fallback events" "$0"
  grep -q "docker stats" "$0"
  grep -q "SERVER_DOCKER_COMMAND" "$0"
  grep -q "30분/1시간 soak" "${REPO_ROOT}/docs/operations/GCS-Saker_M7_streaming_stability_soak.md"
  python3 "${REPO_ROOT}/scripts/webrtc_ice_smoke.py" --check
  python3 "${REPO_ROOT}/scripts/webrtc_whip_publish_smoke.py" --check
  python3 "${REPO_ROOT}/scripts/turn_relay_smoke.py" --check
  echo "M7 streaming stability soak check passed"
}

run_live() {
  require_command curl
  require_command python3
  if [[ "$RUN_TURN_ALLOCATIONS" == "1" && ( -z "$TURN_USERNAME" || -z "$TURN_PASSWORD" ) ]]; then
    echo "TURN_USERNAME and TURN_PASSWORD are required when RUN_TURN_ALLOCATIONS=1" >&2
    exit 1
  fi
  if [[ -n "$REPORT_FILE" ]]; then
    : >"$REPORT_FILE"
  fi

  local started_ms
  local deadline_ms
  local sample=0
  local success_count=0
  local failure_count=0
  local disconnect_events=0
  local reconnect_successes=0
  local fallback_events=0
  local had_failure=0
  local health_status
  local ready_status
  local media_ready_status
  local ice_status
  local ice_server_for_media="$STUN_URL"
  local auth_args=()
  local insecure_arg=()
  local whip_url="${EDGE_BASE_URL}/webrtc/${STREAM_PATH}/whip"
  local whep_url="${EDGE_BASE_URL}/webrtc/${STREAM_PATH}/whep"
  local publisher_seconds=$((SOAK_DURATION_SECONDS + 5))

  cleanup_publisher() {
    if [[ -n "$PUBLISHER_PID" ]]; then
      kill "$PUBLISHER_PID" >/dev/null 2>&1 || true
      wait "$PUBLISHER_PID" >/dev/null 2>&1 || true
    fi
  }
  trap cleanup_publisher EXIT

  if [[ "$INSECURE_TLS" == "1" ]]; then
    insecure_arg=(--insecure)
  fi
  if [[ "$RELAY_ONLY" == "1" ]]; then
    ice_server_for_media="$TURN_PRIMARY_URL"
    auth_args=(--ice-username "$TURN_USERNAME" --ice-credential "$TURN_PASSWORD")
  fi

  started_ms="$(now_ms)"
  deadline_ms=$((started_ms + SOAK_DURATION_SECONDS * 1000))

  append_report "M7 streaming stability soak run"
  append_report "Edge base URL: ${EDGE_BASE_URL}"
  append_report "Stream path: ${STREAM_PATH}"
  append_report "Duration seconds: ${SOAK_DURATION_SECONDS}"
  append_report "Sample interval seconds: ${SOAK_SAMPLE_INTERVAL_SECONDS}"
  append_report "Relay-only requested: ${RELAY_ONLY}"
  append_report "30-minute baseline: SOAK_DURATION_SECONDS=1800"
  append_report "1-hour baseline: SOAK_DURATION_SECONDS=3600"

  health_status="$(curl_status "${EDGE_BASE_URL}/healthz")"
  ready_status="$(curl_status "${EDGE_BASE_URL}/readyz")"
  media_ready_status="$(curl_status "${EDGE_BASE_URL}/media-control/readyz")"
  ice_status="$(curl_status "${EDGE_BASE_URL}/media-control/api/v1/streams/ice-servers")"
  append_report "initial healthz HTTP status: ${health_status}"
  append_report "initial readyz HTTP status: ${ready_status}"
  append_report "initial media-control readyz HTTP status: ${media_ready_status}"
  append_report "initial ice server API HTTP status: ${ice_status}"
  if [[ "$health_status" != "200" || "$ready_status" != "200" || "$media_ready_status" != "200" || "$ice_status" != "200" ]]; then
    echo "public edge readiness check failed" >&2
    exit 1
  fi

  python3 "${REPO_ROOT}/scripts/webrtc_whip_publish_smoke.py" \
    --run \
    --whip-url "$whip_url" \
    --ice-server-url "$ice_server_for_media" \
    ${auth_args+"${auth_args[@]}"} \
    "${insecure_arg[@]}" \
    --require-connected \
    --publish-seconds "$publisher_seconds" \
    --timeout-seconds "$TIMEOUT_SECONDS" \
    --fps "$SOAK_PUBLISH_FPS" >/tmp/gcs-saker-soak-publisher.out 2>&1 &
  PUBLISHER_PID=$!
  sleep 5

  while [[ "$(now_ms)" -lt "$deadline_ms" ]]; do
    sample=$((sample + 1))
    append_report "sample ${sample} started"
    health_status="$(curl_status "${EDGE_BASE_URL}/healthz")"
    ready_status="$(curl_status "${EDGE_BASE_URL}/readyz")"
    media_ready_status="$(curl_status "${EDGE_BASE_URL}/media-control/readyz")"
    append_report "sample ${sample} healthz=${health_status} readyz=${ready_status} media_control_readyz=${media_ready_status}"

    if [[ "$RUN_TURN_ALLOCATIONS" == "1" ]]; then
      run_turn_allocation "sample ${sample} TURN primary" "$TURN_PRIMARY_URL" || true
      run_turn_allocation "sample ${sample} TURN secondary" "$TURN_SECONDARY_URL" || true
    fi

    if python3 "${REPO_ROOT}/scripts/webrtc_ice_smoke.py" \
      --run \
      --require-connected \
      --require-video-frame \
      --whep-url "$whep_url" \
      --ice-server-url "$ice_server_for_media" \
      ${auth_args+"${auth_args[@]}"} \
      "${insecure_arg[@]}" \
      --timeout-seconds "$TIMEOUT_SECONDS" >/tmp/gcs-saker-soak-whep.out 2>&1; then
      success_count=$((success_count + 1))
      if [[ "$had_failure" == "1" ]]; then
        reconnect_successes=$((reconnect_successes + 1))
        had_failure=0
      fi
      append_report "sample ${sample} WHEP result: success"
    else
      failure_count=$((failure_count + 1))
      disconnect_events=$((disconnect_events + 1))
      fallback_events=$((fallback_events + 1))
      had_failure=1
      append_report "sample ${sample} WHEP result: failure"
    fi
    sed 's/^/  /' /tmp/gcs-saker-soak-whep.out | while IFS= read -r line; do append_report "$line"; done
    sample_server_metrics "$sample"

    if [[ "$(now_ms)" -lt "$deadline_ms" ]]; then
      sleep "$SOAK_SAMPLE_INTERVAL_SECONDS"
    fi
  done

  if [[ -n "$PUBLISHER_PID" ]]; then
    wait "$PUBLISHER_PID" || true
    PUBLISHER_PID=""
  fi
  append_report "publisher summary:"
  sed 's/^/  /' /tmp/gcs-saker-soak-publisher.out | while IFS= read -r line; do append_report "$line"; done

  append_report "soak samples total: ${sample}"
  append_report "soak WHEP successes: ${success_count}"
  append_report "soak WHEP failures: ${failure_count}"
  append_report "disconnect events: ${disconnect_events}"
  append_report "reconnect successes: ${reconnect_successes}"
  append_report "fallback events: ${fallback_events}"
  append_report "soak wall latency ms: $(($(now_ms) - started_ms))"

  if [[ "$sample" -eq 0 || "$failure_count" -gt 0 ]]; then
    echo "M7 streaming stability soak failed: samples=${sample}, failures=${failure_count}" >&2
    exit 1
  fi
  append_report "M7 streaming stability soak run passed"
}

case "$MODE" in
  check)
    run_check
    ;;
  run)
    run_live
    ;;
esac
