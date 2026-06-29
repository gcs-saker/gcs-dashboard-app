#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="check"
EDGE_BASE_URL="${EDGE_BASE_URL:-https://a4ai.tplinkdns.com}"
STREAM_PATH="${STREAM_PATH:-raw/nat/smoke}"
STREAM_ID="${STREAM_ID:-${STREAM_PATH//\//.}}"
STUN_URL="${STUN_URL:-stun:a4ai.tplinkdns.com:3478}"
TURN_PRIMARY_URL="${TURN_PRIMARY_URL:-turn:a4ai.tplinkdns.com:3478?transport=udp}"
TURN_SECONDARY_URL="${TURN_SECONDARY_URL:-turn:a4ai.tplinkdns.com:3479?transport=udp}"
TURN_USERNAME="${TURN_USERNAME:-${WEBRTC_TURN_USERNAME:-}}"
TURN_PASSWORD="${TURN_PASSWORD:-${WEBRTC_TURN_PASSWORD:-}}"
AUTH_BEARER_TOKEN="${AUTH_BEARER_TOKEN:-}"
RUN_TURN_ALLOCATIONS="${RUN_TURN_ALLOCATIONS:-1}"
RUN_WHIP_PUBLISH="${RUN_WHIP_PUBLISH:-1}"
RUN_WHEP_PLAYBACK="${RUN_WHEP_PLAYBACK:-1}"
RELAY_ONLY="${RELAY_ONLY:-0}"
INSECURE_TLS="${INSECURE_TLS:-1}"
PUBLISH_SECONDS="${PUBLISH_SECONDS:-20}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-15}"
WHEP_RETRY_COUNT="${WHEP_RETRY_COUNT:-5}"
WHEP_RETRY_DELAY_SECONDS="${WHEP_RETRY_DELAY_SECONDS:-2}"
REPORT_FILE="${REPORT_FILE:-}"
PUBLISHER_PID=""
auth_args=()
insecure_arg=()

usage() {
  cat <<'EOF'
Usage:
  scripts/m7_external_nat_webrtc_smoke.sh [--check|--run]

Modes:
  --check  Validate external NAT smoke contracts without network calls.
  --run    Validate public edge, TURN allocation, WHIP publish, WHEP first frame, and candidate summary.

Environment:
  EDGE_BASE_URL         Default: https://a4ai.tplinkdns.com
  STREAM_PATH           Default: raw/nat/smoke
  STUN_URL              Default: stun:a4ai.tplinkdns.com:3478
  TURN_PRIMARY_URL      Default: turn:a4ai.tplinkdns.com:3478?transport=udp
  TURN_SECONDARY_URL    Default: turn:a4ai.tplinkdns.com:3479?transport=udp
  TURN_USERNAME         Defaults to WEBRTC_TURN_USERNAME
  TURN_PASSWORD         Defaults to WEBRTC_TURN_PASSWORD
  AUTH_BEARER_TOKEN     Optional token for auth-protected ICE server API readiness.
                        Required for WHIP publish authorization when RUN_WHIP_PUBLISH=1.
  RUN_TURN_ALLOCATIONS  Default: 1
  RUN_WHIP_PUBLISH      Default: 1
  RUN_WHEP_PLAYBACK     Default: 1
  RELAY_ONLY            Default: 0. Set 1 to use TURN primary for WHIP/WHEP ICE server.
  INSECURE_TLS          Default: 1 for current self-signed staging certificate.
  REPORT_FILE           Optional path to write the same report output.
  WHEP_RETRY_COUNT      Default: 5. Retries WHEP while WHIP path becomes visible.
  WHEP_RETRY_DELAY_SECONDS Default: 2.
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
  if [[ -n "$AUTH_BEARER_TOKEN" ]]; then
    curl $(tls_args) -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" -s -o /dev/null -w "%{http_code}" "$url"
  else
    curl $(tls_args) -s -o /dev/null -w "%{http_code}" "$url"
  fi
}

resolve_publish_whip_url() {
  local publish_auth_url="${EDGE_BASE_URL}/media-control/api/v1/streams/${STREAM_ID}/publish"
  if [[ -z "$AUTH_BEARER_TOKEN" ]]; then
    echo "AUTH_BEARER_TOKEN is required to request an authorized WHIP publish URL" >&2
    exit 1
  fi
  # shellcheck disable=SC2046
  curl $(tls_args) -fsS \
    -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" \
    -H "Accept: application/json" \
    "$publish_auth_url" \
    | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload["whipUrl"])'
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
    --timeout-seconds "$TIMEOUT_SECONDS"
  finished="$(now_ms)"
  append_report "${label} allocation latency ms: $((finished - started))"
}

run_whep_playback_with_retry() {
  local whep_url="$1"
  local ice_server_for_media="$2"
  local attempt=1
  local output
  local status
  while [[ "$attempt" -le "$WHEP_RETRY_COUNT" ]]; do
    set +e
    output="$(
      python3 "${REPO_ROOT}/scripts/webrtc_ice_smoke.py" \
        --run \
        --require-connected \
        --require-video-frame \
        --measure-audio-video-sync \
        --whep-url "$whep_url" \
        --ice-server-url "$ice_server_for_media" \
        ${auth_args+"${auth_args[@]}"} \
        "${insecure_arg[@]}" \
        --timeout-seconds "$TIMEOUT_SECONDS" 2>&1
    )"
    status=$?
    set -e
    printf '%s\n' "$output"
    if [[ "$status" -eq 0 ]]; then
      append_report "WHEP playback attempt ${attempt}: success"
      return 0
    fi
    if [[ "$output" != *"no stream is available"* || "$attempt" -eq "$WHEP_RETRY_COUNT" ]]; then
      append_report "WHEP playback attempt ${attempt}: failed"
      return "$status"
    fi
    append_report "WHEP playback attempt ${attempt}: waiting for WHIP path visibility"
    sleep "$WHEP_RETRY_DELAY_SECONDS"
    attempt=$((attempt + 1))
  done
}

run_check() {
  bash -n "$0"
  python3 "${REPO_ROOT}/scripts/turn_relay_smoke.py" --check
  python3 "${REPO_ROOT}/scripts/webrtc_ice_smoke.py" --check
  python3 "${REPO_ROOT}/scripts/webrtc_whip_publish_smoke.py" --check
  grep -q "외부 NAT STUN/TURN/WebRTC 검증" "${REPO_ROOT}/docs/operations/GCS-Saker_M7_external_nat_webrtc_validation.md"
  echo "M7 external NAT WebRTC smoke check passed"
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
  local health_status
  local ready_status
  local media_ready_status
  local ice_status
  local ice_server_for_media="$STUN_URL"
  local whip_url="${EDGE_BASE_URL}/webrtc/${STREAM_PATH}/whip"
  local whep_url="${EDGE_BASE_URL}/webrtc/${STREAM_PATH}/whep"

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
  health_status="$(curl_status "${EDGE_BASE_URL}/healthz")"
  ready_status="$(curl_status "${EDGE_BASE_URL}/readyz")"
  media_ready_status="$(curl_status "${EDGE_BASE_URL}/media-control/readyz")"
  ice_status="$(curl_status "${EDGE_BASE_URL}/media-control/api/v1/streams/ice-servers")"

  append_report "M7 external NAT WebRTC smoke run"
  append_report "Edge base URL: ${EDGE_BASE_URL}"
  append_report "Stream path: ${STREAM_PATH}"
  append_report "Relay-only requested: ${RELAY_ONLY}"
  append_report "healthz HTTP status: ${health_status}"
  append_report "readyz HTTP status: ${ready_status}"
  append_report "media-control readyz HTTP status: ${media_ready_status}"
  append_report "ice server API HTTP status: ${ice_status}"

  if [[ "$health_status" != "200" || "$ready_status" != "200" || "$media_ready_status" != "200" ]]; then
    echo "public edge readiness check failed" >&2
    exit 1
  fi
  if [[ -n "$AUTH_BEARER_TOKEN" && "$ice_status" != "200" ]]; then
    echo "authenticated ice server API readiness check failed" >&2
    exit 1
  fi
  if [[ -z "$AUTH_BEARER_TOKEN" && "$ice_status" != "200" && "$ice_status" != "401" ]]; then
    echo "ice server API auth gate readiness check failed" >&2
    exit 1
  fi
  if [[ -z "$AUTH_BEARER_TOKEN" && "$ice_status" == "401" ]]; then
    append_report "ice server API auth gate: enforced"
  fi

  if [[ "$RUN_TURN_ALLOCATIONS" == "1" ]]; then
    run_turn_allocation "TURN primary" "$TURN_PRIMARY_URL"
    run_turn_allocation "TURN secondary" "$TURN_SECONDARY_URL"
  fi

  if [[ "$RUN_WHIP_PUBLISH" == "1" ]]; then
    whip_url="$(resolve_publish_whip_url)"
    append_report "authorized WHIP publish URL resolved through media-control"
    python3 "${REPO_ROOT}/scripts/webrtc_whip_publish_smoke.py" \
      --run \
      --whip-url "$whip_url" \
      --ice-server-url "$ice_server_for_media" \
      ${auth_args+"${auth_args[@]}"} \
      "${insecure_arg[@]}" \
      --require-connected \
      --publish-seconds "$PUBLISH_SECONDS" \
      --timeout-seconds "$TIMEOUT_SECONDS" &
    PUBLISHER_PID=$!
    sleep 5
  fi

  if [[ "$RUN_WHEP_PLAYBACK" == "1" ]]; then
    run_whep_playback_with_retry "$whep_url" "$ice_server_for_media"
  fi

  if [[ -n "$PUBLISHER_PID" ]]; then
    wait "$PUBLISHER_PID"
    PUBLISHER_PID=""
  fi

  append_report "External NAT smoke wall latency ms: $(($(now_ms) - started_ms))"
  append_report "Security gate: WHIP publish URL was issued by media-control authorization"
  append_report "M7 external NAT WebRTC smoke run passed"
}

case "$MODE" in
  check)
    run_check
    ;;
  run)
    run_live
    ;;
esac
