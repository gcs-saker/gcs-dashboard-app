#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="check"
SENSOR_ID="${SENSOR_ID:-front}"
PUBLISH_DURATION_SECONDS="${PUBLISH_DURATION_SECONDS:-90}"
PLAYBACK_RETRY_COUNT="${PLAYBACK_RETRY_COUNT:-10}"
PLAYBACK_RETRY_DELAY_SECONDS="${PLAYBACK_RETRY_DELAY_SECONDS:-1}"
START_STACK="${START_STACK:-1}"
STOP_STACK="${STOP_STACK:-0}"
RUN_WEBRTC_ICE_SMOKE="${RUN_WEBRTC_ICE_SMOKE:-1}"
RUN_HLS_SMOKE="${RUN_HLS_SMOKE:-0}"
PYTHON_IMAGE="${PYTHON_IMAGE:-python:3.12-slim}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-gcs-saker-arch-poc}"
EDGE_BASE_URL="${EDGE_BASE_URL:-http://127.0.0.1:18080}"
MEDIA_NETWORK="${MEDIA_NETWORK:-${COMPOSE_PROJECT_NAME}_media-net}"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/deploy/compose/.env.single-node.example}"
PUBLISHER_NAME="gcs-saker-m7-publisher-$$"
SESSION_DIR=""
PUBLISHER_STARTED_MS=""
OWNER_TOKEN_FILE=""
SIBLING_TOKEN_FILE=""

usage() {
  cat <<'EOF'
Usage: scripts/smoke/m7_publish_play_smoke.sh [--check|--run]

  --check  Validate the authenticated publish/play smoke contract.
  --run    Issue an opaque session, publish WHIP audio/video, then verify HLS and WHEP.

Environment:
  SENSOR_ID                Device sensor label sent to media-control. Default: front
  PUBLISH_DURATION_SECONDS Default: 90
  START_STACK              Start the single-node stack first. Default: 1
  STOP_STACK               Stop compose after the smoke. Default: 0
  RUN_WEBRTC_ICE_SMOKE     Verify WHEP audio and video frames. Default: 1
  RUN_HLS_SMOKE            Verify HLS only with an H264-compatible publisher. Default: 0
  PYTHON_IMAGE             Default: python:3.12-slim
  EDGE_BASE_URL            Default: http://127.0.0.1:18080
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) MODE="check" ;;
    --run) MODE="run" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

require_command() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 127; }
}

load_auth_credentials() {
  set -a
  # shellcheck disable=SC1090,SC1091
  . <(sed 's/\r$//' "$ENV_FILE")
  set +a
}

now_ms() {
  python3 -c 'import time; print(int(time.time() * 1000))'
}

cleanup() {
  local status=$?
  if [[ "$status" -ne 0 ]] && docker inspect "$PUBLISHER_NAME" >/dev/null 2>&1; then
    echo "Authenticated WHIP publisher failed; retained tail follows" >&2
    docker logs --tail 80 "$PUBLISHER_NAME" 2>&1 >&2 || true
  fi
  docker rm -f "$PUBLISHER_NAME" >/dev/null 2>&1 || true
  if [[ -n "$SESSION_DIR" && -d "$SESSION_DIR" ]]; then
    rm -f -- "$SESSION_DIR/access-token" "$SESSION_DIR/sibling-access-token" "$SESSION_DIR/publish-token" "$SESSION_DIR/session.json" "$SESSION_DIR/playback.json" "$SESSION_DIR/sibling-playback.json"
    rmdir -- "$SESSION_DIR" 2>/dev/null || true
  fi
  if [[ "$STOP_STACK" == "1" ]]; then
    STOP_STACK=1 "${REPO_ROOT}/scripts/smoke/m7_single_node_runtime_smoke.sh" --run >/dev/null 2>&1 || true
  fi
  return "$status"
}

wait_for_http() {
  local url="$1" attempts="${2:-60}" attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    curl -fsS "$url" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "Timed out waiting for authorized media URL" >&2
  return 1
}

rewrite_origin_for_container() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import urlsplit, urlunsplit

source = urlsplit(sys.argv[1])
print(urlunsplit(("http", "edge:8080", source.path, source.query, source.fragment)))
PY
}

json_field() {
  python3 - "$1" "$2" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as payload_file:
    value = json.load(payload_file)
for segment in sys.argv[2].split("."):
    value = value[segment]
print(value)
PY
}

login_to_file() {
  local username="$1" password="$2" token_file="$3"
  curl -fsS -H "Content-Type: application/json" -H "Origin: ${EDGE_BASE_URL}" \
    -H "X-GCS-CSRF: same-origin" \
    -d "{\"username\":\"${username}\",\"password\":\"${password}\"}" \
    "${EDGE_BASE_URL}/auth-policy/auth/login" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' \
    >"${token_file}"
  chmod 600 "${token_file}"
}

login() {
  OWNER_TOKEN_FILE="${SESSION_DIR}/access-token"
  SIBLING_TOKEN_FILE="${SESSION_DIR}/sibling-access-token"
  login_to_file "${AUTH_POLICY_OPERATOR_USERNAME:-operator01}" \
    "${AUTH_POLICY_OPERATOR_PASSWORD:-correct-password}" "$OWNER_TOKEN_FILE"
  login_to_file "${AUTH_POLICY_SMOKE_USERNAME:-m7-smoke-viewer}" \
    "${AUTH_POLICY_SMOKE_PASSWORD}" "$SIBLING_TOKEN_FILE"
}

issue_publish_session() {
  local access_token
  access_token="$(<"$OWNER_TOKEN_FILE")"
  curl -fsS -H "Authorization: Bearer ${access_token}" -H "Content-Type: application/json" \
    -d "{\"sensorId\":\"${SENSOR_ID}\"}" \
    "${EDGE_BASE_URL}/media-control/api/v1/account/publish-sessions" \
    >"${SESSION_DIR}/session.json"
  json_field "${SESSION_DIR}/session.json" publishToken >"${SESSION_DIR}/publish-token"
  chmod 600 "${SESSION_DIR}/session.json" "${SESSION_DIR}/publish-token"
}

start_publisher() {
  local publish_url internal_publish_url
  publish_url="$(json_field "${SESSION_DIR}/session.json" publishUrl)"
  internal_publish_url="$(rewrite_origin_for_container "$publish_url")"
  docker run -d --name "$PUBLISHER_NAME" --network "$MEDIA_NETWORK" \
    -v "${REPO_ROOT}:/workspace:ro" -v "${SESSION_DIR}:/run/gcs-smoke:ro" -w /workspace \
    "$PYTHON_IMAGE" \
    bash -lc 'pip install aiortc >/tmp/aiortc-install.log && python scripts/smoke/webrtc_whip_publish_smoke.py --run --require-connected --whip-url "$1" --publish-token-file /run/gcs-smoke/publish-token --ice-server-url stun:turn-primary:3478 --publish-seconds "$2"' \
    smoke "$internal_publish_url" "$PUBLISH_DURATION_SECONDS" >/dev/null
  PUBLISHER_STARTED_MS="$(now_ms)"
}

wait_for_publisher() {
  local attempt
  for ((attempt = 1; attempt <= 45; attempt += 1)); do
    docker logs "$PUBLISHER_NAME" 2>&1 | grep -q "WHIP publisher connected" && return 0
    if ! docker inspect "$PUBLISHER_NAME" >/dev/null 2>&1; then
      docker logs "$PUBLISHER_NAME" 2>&1 || true
      return 1
    fi
    sleep 1
  done
  echo "Timed out waiting for authenticated WHIP publisher" >&2
  return 1
}

issue_playback_urls() {
  local access_token stream_id attempt status
  access_token="$(<"$OWNER_TOKEN_FILE")"
  stream_id="$(json_field "${SESSION_DIR}/session.json" streamId)"
  for ((attempt = 1; attempt <= PLAYBACK_RETRY_COUNT; attempt += 1)); do
    status="$(curl -sS -o "${SESSION_DIR}/playback.json" -w '%{http_code}' \
      -H "Authorization: Bearer ${access_token}" \
      "${EDGE_BASE_URL}/media-control/api/v1/streams/${stream_id}/playback")"
    chmod 600 "${SESSION_DIR}/playback.json"
    [[ "$status" == "200" ]] && return 0
    [[ "$status" == "404" || "$status" == "409" ]] || {
      echo "Playback authorization failed with HTTP ${status}" >&2
      return 1
    }
    echo "Waiting for stream registry (${attempt}/${PLAYBACK_RETRY_COUNT})" >&2
    sleep "$PLAYBACK_RETRY_DELAY_SECONDS"
  done
  echo "Timed out waiting for stream registry" >&2
  return 1
}

verify_sibling_playback_denied() {
  local access_token stream_id status
  access_token="$(<"$SIBLING_TOKEN_FILE")"
  stream_id="$(json_field "${SESSION_DIR}/session.json" streamId)"
  status="$(curl -sS -o "${SESSION_DIR}/sibling-playback.json" -w '%{http_code}' \
    -H "Authorization: Bearer ${access_token}" \
    "${EDGE_BASE_URL}/media-control/api/v1/streams/${stream_id}/playback")"
  chmod 600 "${SESSION_DIR}/sibling-playback.json"
  [[ "$status" == "403" ]] || {
    echo "Sibling-group playback expected HTTP 403, received ${status}" >&2
    return 1
  }
  echo "Sibling-group playback denial passed"
}

first_hls_variant_url() {
  python3 - "$1" "$2" <<'PY'
import sys
from urllib.parse import urljoin

for line in sys.argv[2].splitlines():
    value = line.strip()
    if value and not value.startswith("#"):
        print(urljoin(sys.argv[1], value))
        break
PY
}

verify_hls() {
  local master_url master_body variant_url
  master_url="$(json_field "${SESSION_DIR}/playback.json" playbackUrls.hls)"
  wait_for_http "$master_url" 60
  master_body="$(curl -fsS "$master_url")"
  grep -q '^#EXTM3U' <<<"$master_body"
  variant_url="$(first_hls_variant_url "$master_url" "$master_body")"
  [[ -n "$variant_url" ]] && wait_for_http "$variant_url" 60
}

verify_whep() {
  local whep_url internal_whep_url
  whep_url="$(json_field "${SESSION_DIR}/playback.json" playbackUrls.webrtc)"
  internal_whep_url="$(rewrite_origin_for_container "$whep_url")"
  docker run --rm --network "$MEDIA_NETWORK" -v "${REPO_ROOT}:/workspace:ro" -w /workspace \
    "$PYTHON_IMAGE" bash -lc 'pip install aiortc >/tmp/aiortc-install.log && python scripts/smoke/webrtc_ice_smoke.py --run --require-connected --require-video-frame --require-audio-frame --measure-audio-video-sync --latency-profile playback --enforce-latency-budget --whep-url "$1" --ice-server-url stun:turn-primary:3478' \
    smoke "$internal_whep_url"
}

run_check() {
  bash -n "$0"
  python3 "${REPO_ROOT}/scripts/smoke/webrtc_whip_publish_smoke.py" --check
  python3 "${REPO_ROOT}/scripts/smoke/webrtc_ice_smoke.py" --check
  grep -q "WebRTC publish/play smoke" "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_publish_play_smoke.md"
  echo "M7 publish/play smoke check passed"
}

run_live() {
  require_command docker; require_command curl; require_command python3
  load_auth_credentials
  SESSION_DIR="$(mktemp -d)"
  chmod 700 "$SESSION_DIR"
  trap cleanup EXIT
  [[ "$START_STACK" == "1" ]] && "${REPO_ROOT}/scripts/smoke/m7_single_node_runtime_smoke.sh" --run
  wait_for_http "${EDGE_BASE_URL}/healthz"
  wait_for_http "${EDGE_BASE_URL}/readyz"
  login
  issue_publish_session
  start_publisher
  wait_for_publisher
  issue_playback_urls
  verify_sibling_playback_denied
  [[ "$RUN_HLS_SMOKE" == "1" ]] && verify_hls
  [[ "$RUN_WEBRTC_ICE_SMOKE" == "1" ]] && verify_whep
  echo "M7 authenticated publish/play smoke run passed"
  echo "Publish-to-playback visibility latency ms: $(($(now_ms) - PUBLISHER_STARTED_MS))"
}

case "$MODE" in
  check) run_check ;;
  run) run_live ;;
esac
