#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="check"
STREAM_PATH="${STREAM_PATH:-raw/sample/front}"
STREAM_ID="${STREAM_ID:-${STREAM_PATH//\//.}}"
PUBLISH_DURATION_SECONDS="${PUBLISH_DURATION_SECONDS:-35}"
START_STACK="${START_STACK:-1}"
STOP_STACK="${STOP_STACK:-0}"
EDGE_BASE_URL="${EDGE_BASE_URL:-http://127.0.0.1:18080}"
FFMPEG_IMAGE="${FFMPEG_IMAGE:-jrottenberg/ffmpeg:6.1-alpine}"
FFMPEG_PLATFORM="${FFMPEG_PLATFORM:-}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-gcs-saker-arch-poc}"
MEDIA_NETWORK="${MEDIA_NETWORK:-${COMPOSE_PROJECT_NAME}_media-net}"
PUBLISHER_NAME="gcs-saker-m7-media-control-publisher-$$"

usage() {
  cat <<'EOF'
Usage:
  scripts/m7_media_control_cutover_smoke.sh [--check|--run]

Modes:
  --check  Validate Go media-control cutover contract files.
  --run    Publish a sample stream and verify Go media-control stream/ICE/playback APIs through edge.

Environment:
  STREAM_PATH               Default: raw/sample/front
  START_STACK               Run m7_single_node_runtime_smoke.sh first. Default: 1
  STOP_STACK                Stop compose after the smoke. Default: 0
  EDGE_BASE_URL             Default: http://127.0.0.1:18080
  PUBLISH_DURATION_SECONDS  Default: 35
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

cleanup() {
  docker rm -f "$PUBLISHER_NAME" >/dev/null 2>&1 || true
  if [[ "$STOP_STACK" == "1" ]]; then
    STOP_STACK=1 "${REPO_ROOT}/scripts/m7_single_node_runtime_smoke.sh" --run >/dev/null 2>&1 || true
  fi
}

start_publisher() {
  local docker_args=(docker run -d --rm --name "$PUBLISHER_NAME" --network "$MEDIA_NETWORK")
  if [[ -n "$FFMPEG_PLATFORM" ]]; then
    docker_args+=(--platform "$FFMPEG_PLATFORM")
  fi

  "${docker_args[@]}" \
    "$FFMPEG_IMAGE" \
    -hide_banner \
    -loglevel warning \
    -re \
    -f lavfi \
    -i "testsrc2=size=1280x720:rate=30" \
    -t "$PUBLISH_DURATION_SECONDS" \
    -an \
    -c:v libx264 \
    -preset ultrafast \
    -tune zerolatency \
    -pix_fmt yuv420p \
    -g 30 \
    -f rtsp \
    -rtsp_transport tcp \
    "rtsp://mediamtx:8554/${STREAM_PATH}" >/dev/null
}

wait_for_media_control_stream() {
  local attempts="${1:-45}"
  local delay_seconds="${2:-1}"
  local attempt
  local payload

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    payload="$(curl -fsS "${EDGE_BASE_URL}/media-control/api/v1/streams" 2>/dev/null || true)"
    if PAYLOAD="$payload" python3 - "$STREAM_ID" >/dev/null 2>&1 <<'PY'
import json
import os
import sys

stream_id = sys.argv[1]
payload = json.loads(os.environ["PAYLOAD"])
assert any(item.get("streamId") == stream_id and item.get("status") == "online" for item in payload)
PY
    then
      return 0
    fi
    sleep "$delay_seconds"
  done

  echo "Timed out waiting for media-control stream: ${STREAM_ID}" >&2
  return 1
}

assert_json_contract() {
  local url="$1"
  local expected="$2"
  local payload
  payload="$(curl -fsS "$url")"
  PAYLOAD="$payload" python3 - "$expected" "$STREAM_ID" "$EDGE_BASE_URL" <<'PY'
import json
import os
import sys

expected = sys.argv[1]
stream_id = sys.argv[2]
edge_base = sys.argv[3].rstrip("/")
payload = json.loads(os.environ["PAYLOAD"])

if expected == "ice":
    assert isinstance(payload, list), payload
    assert payload and payload[0]["urls"].startswith(("stun:", "turn:")), payload
elif expected == "detail":
    assert payload["streamId"] == stream_id, payload
    assert payload["path"] == stream_id.replace(".", "/"), payload
    assert payload["status"] == "online", payload
elif expected == "playback":
    assert payload["streamId"] == stream_id, payload
    urls = payload["playbackUrls"]
    assert urls["webrtc"] == f"{edge_base}/webrtc/{stream_id.replace('.', '/')}/whep", urls
    assert urls["hls"] == f"{edge_base}/hls/{stream_id.replace('.', '/')}/index.m3u8", urls
elif expected == "status":
    assert payload == {"streamId": stream_id, "status": "online"}, payload
else:
    raise AssertionError(expected)
PY
}

run_check() {
  bash -n "$0"
  grep -q "func ParseStreamID" "${REPO_ROOT}/services/media-control/internal/domain/stream.go"
  grep -q "func NewPlaybackURLBuilder" "${REPO_ROOT}/services/media-control/internal/domain/playback.go"
  grep -q "/api/v1/streams/ice-servers" "${REPO_ROOT}/services/media-control/internal/httpapi/server.go"
  grep -q "VITE_STREAM_API_BASE_URL" "${REPO_ROOT}/gcs-dashboard/src/config.ts"
  grep -q "location /media-control/" "${REPO_ROOT}/deploy/nginx/single-node.poc.conf"
  echo "M7 media-control cutover smoke check passed"
}

run_live() {
  require_command docker
  require_command curl
  require_command python3
  trap cleanup EXIT

  if [[ "$START_STACK" == "1" ]]; then
    "${REPO_ROOT}/scripts/m7_single_node_runtime_smoke.sh" --run
  fi

  assert_json_contract "${EDGE_BASE_URL}/media-control/api/v1/streams/ice-servers" ice
  start_publisher
  wait_for_media_control_stream
  assert_json_contract "${EDGE_BASE_URL}/media-control/api/v1/streams/${STREAM_ID}" detail
  assert_json_contract "${EDGE_BASE_URL}/media-control/api/v1/streams/${STREAM_ID}/playback" playback
  assert_json_contract "${EDGE_BASE_URL}/media-control/api/v1/streams/${STREAM_ID}/status" status

  echo "M7 media-control cutover smoke run passed"
  echo "Stream ID: ${STREAM_ID}"
  echo "Verified: Go stream list, detail, playback, status, ICE servers through /media-control"
}

case "$MODE" in
  check)
    run_check
    ;;
  run)
    run_live
    ;;
esac
