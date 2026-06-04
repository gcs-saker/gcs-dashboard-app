#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="${REPO_ROOT}/deploy/compose"
COMPOSE_FILE="${COMPOSE_DIR}/compose.single-node.poc.yml"
ENV_FILE="${ENV_FILE:-${COMPOSE_DIR}/.env.single-node.example}"
MODE="check"
START_STACK="${START_STACK:-1}"
STOP_STACK="${STOP_STACK:-0}"
USE_SMOKE_PORTS="${USE_SMOKE_PORTS:-1}"

usage() {
  cat <<'EOF'
Usage:
  scripts/m7_single_node_runtime_smoke.sh [--check|--run]

Modes:
  --check  Validate the runtime smoke contract without requiring a live stack.
  --run    Start the single-node PoC stack and verify edge/backend/auth/media/TURN paths.

Environment:
  ENV_FILE     Compose env file. Default: deploy/compose/.env.single-node.example
  START_STACK  In --run, start docker compose first. Default: 1
  STOP_STACK   In --run, stop docker compose at the end. Default: 0
  USE_SMOKE_PORTS  In --run, avoid common local ports. Default: 1
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

compose() {
  docker compose \
    --project-directory "$COMPOSE_DIR" \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    --profile future-services \
    "$@"
}

load_env() {
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

apply_smoke_ports() {
  if [[ "$USE_SMOKE_PORTS" != "1" ]]; then
    return 0
  fi

  export PUBLIC_HTTP_PORT="${GCS_SMOKE_PUBLIC_HTTP_PORT:-18080}"
  export MEDIAMTX_RTSP_PORT="${GCS_SMOKE_MEDIAMTX_RTSP_PORT:-18554}"
  export MEDIAMTX_RTMP_PORT="${GCS_SMOKE_MEDIAMTX_RTMP_PORT:-11935}"
  export MEDIAMTX_SRT_PORT="${GCS_SMOKE_MEDIAMTX_SRT_PORT:-18890}"
  export MEDIAMTX_WEBRTC_ICE_UDP_PORT="${GCS_SMOKE_MEDIAMTX_WEBRTC_ICE_PORT:-18189}"
  export MEDIAMTX_WEBRTC_ICE_TCP_PORT="${GCS_SMOKE_MEDIAMTX_WEBRTC_ICE_PORT:-18189}"
  export TURN_PRIMARY_HOST_PORT="${GCS_SMOKE_TURN_PRIMARY_HOST_PORT:-13478}"
  export TURN_SECONDARY_HOST_PORT="${GCS_SMOKE_TURN_SECONDARY_HOST_PORT:-13479}"
  export TURN_PRIMARY_RELAY_HOST_MIN_PORT="${GCS_SMOKE_TURN_PRIMARY_RELAY_HOST_MIN_PORT:-59160}"
  export TURN_PRIMARY_RELAY_HOST_MAX_PORT="${GCS_SMOKE_TURN_PRIMARY_RELAY_HOST_MAX_PORT:-59180}"
  export TURN_SECONDARY_RELAY_HOST_MIN_PORT="${GCS_SMOKE_TURN_SECONDARY_RELAY_HOST_MIN_PORT:-59181}"
  export TURN_SECONDARY_RELAY_HOST_MAX_PORT="${GCS_SMOKE_TURN_SECONDARY_RELAY_HOST_MAX_PORT:-59200}"
  export MEDIAMTX_PUBLIC_WEBRTC_BASE_URL="${GCS_SMOKE_MEDIAMTX_PUBLIC_WEBRTC_BASE_URL:-http://127.0.0.1:${PUBLIC_HTTP_PORT}/webrtc}"
  export MEDIAMTX_PUBLIC_HLS_BASE_URL="${GCS_SMOKE_MEDIAMTX_PUBLIC_HLS_BASE_URL:-http://127.0.0.1:${PUBLIC_HTTP_PORT}/hls}"
  export MEDIA_CONTROL_PUBLIC_WEBRTC_BASE_URL="${GCS_SMOKE_MEDIA_CONTROL_PUBLIC_WEBRTC_BASE_URL:-http://127.0.0.1:${PUBLIC_HTTP_PORT}/webrtc}"
  export MEDIA_CONTROL_PUBLIC_HLS_BASE_URL="${GCS_SMOKE_MEDIA_CONTROL_PUBLIC_HLS_BASE_URL:-http://127.0.0.1:${PUBLIC_HTTP_PORT}/hls}"
  export AUTH_POLICY_BASE_URL="${GCS_SMOKE_AUTH_POLICY_BASE_URL:-http://auth-policy:8080}"
  export MEDIA_CONTROL_DEFAULT_PUBLISHER_GROUP_ID="${GCS_SMOKE_MEDIA_CONTROL_DEFAULT_PUBLISHER_GROUP_ID:-co-a}"
  export MEDIA_CONTROL_STREAM_GROUP_MAP="${GCS_SMOKE_MEDIA_CONTROL_STREAM_GROUP_MAP:-raw/sample/front=co-a,raw/local/webcam=co-a}"
  export VITE_AUTH_API_BASE_URL="${GCS_SMOKE_VITE_AUTH_API_BASE_URL:-/auth-policy/auth}"
  export VITE_STREAM_API_BASE_URL="${GCS_SMOKE_VITE_STREAM_API_BASE_URL:-/media-control}"
  export VITE_LOCAL_WEBCAM_WHIP_URL="${GCS_SMOKE_VITE_LOCAL_WEBCAM_WHIP_URL:-http://127.0.0.1:${PUBLIC_HTTP_PORT}/webrtc/raw/local/webcam/whip}"
  export WEBRTC_STUN_URL="${GCS_SMOKE_WEBRTC_STUN_URL:-stun:127.0.0.1:${TURN_PRIMARY_HOST_PORT}}"
  export WEBRTC_TURN_URL="${GCS_SMOKE_WEBRTC_TURN_URL:-turn:127.0.0.1:${TURN_PRIMARY_HOST_PORT}?transport=udp}"
  export VITE_WEBRTC_STUN_URL="${GCS_SMOKE_VITE_WEBRTC_STUN_URL:-stun:127.0.0.1:${TURN_PRIMARY_HOST_PORT}}"
  export BACKEND_CORS_ALLOW_ORIGINS="${GCS_SMOKE_BACKEND_CORS_ALLOW_ORIGINS:-http://127.0.0.1:${PUBLIC_HTTP_PORT},http://localhost:${PUBLIC_HTTP_PORT}}"
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-45}"
  local delay_seconds="${3:-2}"
  local attempt

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay_seconds"
  done

  echo "Timed out waiting for ${url}" >&2
  return 1
}

wait_for_stream_status() {
  local url="$1"
  local attempts="${2:-45}"
  local delay_seconds="${3:-2}"
  local attempt
  local payload

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    payload="$(curl -fsS "$url" 2>/dev/null || true)"
    if [[ "$payload" == *'"stream":"ready"'* ]]; then
      return 0
    fi
    sleep "$delay_seconds"
  done

  echo "Timed out waiting for ${url} to return media-control stream readiness" >&2
  return 1
}

expect_http_status() {
  local expected_status="$1"
  local url="$2"
  shift 2
  local actual_status

  actual_status="$(curl -sS -o /dev/null -w "%{http_code}" "$@" "$url")"
  if [[ "$actual_status" != "$expected_status" ]]; then
    echo "Expected ${url} to return ${expected_status}, got ${actual_status}" >&2
    return 1
  fi
}

login_access_token() {
  local edge_base_url="$1"
  local username="${AUTH_POLICY_OPERATOR_USERNAME:-operator01}"
  local password="${AUTH_POLICY_OPERATOR_PASSWORD:-correct-password}"

  curl -fsS \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${username}\",\"password\":\"${password}\"}" \
    "${edge_base_url}/auth-policy/auth/login" \
    | python3 -c 'import json, sys; print(json.load(sys.stdin)["access_token"])'
}

check_required_files() {
  test -f "$COMPOSE_FILE"
  test -f "$ENV_FILE"
  test -f "${REPO_ROOT}/deploy/nginx/single-node.poc.conf"
  test -f "${REPO_ROOT}/deploy/mediamtx/mediamtx.closed-network.yml"
  test -f "${REPO_ROOT}/services/auth-policy/build.gradle.kts"
  test -f "${REPO_ROOT}/services/media-control/go.mod"
}

check_contract_text() {
  grep -q "auth-policy" "$COMPOSE_FILE"
  grep -q "media-control" "$COMPOSE_FILE"
  grep -q "turn-primary" "$COMPOSE_FILE"
  grep -q "turn-secondary" "$COMPOSE_FILE"
  grep -q "webrtcICEServers2" "${REPO_ROOT}/deploy/mediamtx/mediamtx.closed-network.yml"
  grep -q "location /stream/" "${REPO_ROOT}/deploy/nginx/single-node.poc.conf"
  grep -q 'add_header Deprecation "true" always;' "${REPO_ROOT}/deploy/nginx/single-node.poc.conf"
  grep -q 'X-GCS-Replacement-Route "/media-control/api/v1/streams"' "${REPO_ROOT}/deploy/nginx/single-node.poc.conf"
  grep -q "location /auth-policy/" "${REPO_ROOT}/deploy/nginx/single-node.poc.conf"
  grep -q "location /media-control/" "${REPO_ROOT}/deploy/nginx/single-node.poc.conf"
  grep -q "location /api/asset/" "${REPO_ROOT}/deploy/nginx/single-node.poc.conf"
  grep -q "location = /api/telemetry/all" "${REPO_ROOT}/deploy/nginx/single-node.poc.conf"
  grep -q "location /webrtc/" "${REPO_ROOT}/deploy/nginx/single-node.poc.conf"
  grep -q "location /hls/" "${REPO_ROOT}/deploy/nginx/single-node.poc.conf"
}

run_check() {
  check_required_files
  check_contract_text
  bash -n "$0"
  python3 "${REPO_ROOT}/scripts/webrtc_ice_smoke.py" --check
  python3 "${REPO_ROOT}/scripts/turn_relay_smoke.py" --check

  if command -v docker >/dev/null 2>&1; then
    compose config --quiet
    echo "Docker compose config check passed"
  else
    echo "Docker compose config check skipped: docker is not installed"
  fi

  echo "M7 single-node runtime smoke check passed"
}

runtime_probe_from_edge() {
  local url="$1"
  compose exec -T edge wget -q -O- "$url" >/dev/null
}

run_live() {
  require_command docker
  require_command curl
  require_command python3
  check_required_files
  load_env
  apply_smoke_ports

  if [[ "$START_STACK" == "1" ]]; then
    compose up -d --build
    compose restart edge >/dev/null
  fi

  local public_http_port="${PUBLIC_HTTP_PORT:-8080}"
  local edge_base_url="http://127.0.0.1:${public_http_port}"
  wait_for_http "${edge_base_url}/healthz"
  wait_for_http "${edge_base_url}/readyz"
  wait_for_stream_status "${edge_base_url}/stream/status"

  expect_http_status "401" \
    "${edge_base_url}/api/telemetry/" \
    -H "Content-Type: application/json" \
    -d '{"uuid":"raw.unauthorized.telemetry"}'

  local access_token
  access_token="$(login_access_token "$edge_base_url")"
  curl -fsS \
    -H "Authorization: Bearer ${access_token}" \
    -H "Content-Type: application/json" \
    -d '{"uuid":"raw.smoke.telemetry","latitude":35.882,"longitude":128.61,"altitude":42,"magneticX":1,"magneticY":2,"magneticZ":3,"soc":"88","phoneBatterySOC":77,"velocity":4.5,"totalDistance":120,"epochTime":65,"portDistance":9}' \
    "${edge_base_url}/api/telemetry/" \
    | grep -q "raw.smoke.telemetry"
  curl -fsS -H "Authorization: Bearer ${access_token}" "${edge_base_url}/api/telemetry/all" | grep -q "raw.sample.front"
  curl -fsS -H "Authorization: Bearer ${access_token}" "${edge_base_url}/api/telemetry/all" | grep -q "raw.smoke.telemetry"
  curl -fsS -H "Authorization: Bearer ${access_token}" "${edge_base_url}/api/asset/raw.sample.front" | grep -q "DRN-01"

  runtime_probe_from_edge "http://auth-policy:8080/healthz"
  runtime_probe_from_edge "http://media-control:8081/healthz"
  runtime_probe_from_edge "http://media-control:8081/v1/ice-servers"
  runtime_probe_from_edge "http://media-control:8081/api/v1/streams/ice-servers"
  runtime_probe_from_edge "http://mediamtx:9997/v3/config/global/get"

  python3 "${REPO_ROOT}/scripts/turn_relay_smoke.py" \
    --run \
    --turn-url "turn:127.0.0.1:${TURN_PRIMARY_HOST_PORT:-3478}?transport=udp" \
    --username "${TURN_USERNAME:-gcs-turn}" \
    --password "${TURN_PASSWORD:?TURN_PASSWORD is required}"

  python3 "${REPO_ROOT}/scripts/turn_relay_smoke.py" \
    --run \
    --turn-url "turn:127.0.0.1:${TURN_SECONDARY_HOST_PORT:-3479}?transport=udp" \
    --username "${TURN_USERNAME:-gcs-turn}" \
    --password "${TURN_PASSWORD:?TURN_PASSWORD is required}"

  curl -fsS "${edge_base_url}/webrtc/" >/dev/null 2>&1 || true
  curl -fsS "${edge_base_url}/hls/" >/dev/null 2>&1 || true

  echo "M7 single-node runtime smoke run passed"
  echo "Edge URL: ${edge_base_url}"
  echo "Verified: auth-policy health/ready/telemetry ingest-read/asset reads, unauthenticated telemetry rejection, media-control stream status/ICE servers, MediaMTX API, TURN primary/secondary allocation"

  if [[ "$STOP_STACK" == "1" ]]; then
    compose down
  fi
}

case "$MODE" in
  check)
    run_check
    ;;
  run)
    run_live
    ;;
esac
