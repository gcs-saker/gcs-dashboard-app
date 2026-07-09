#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="check"
STREAM_PATH="${STREAM_PATH:-raw/sample/front}"
STREAM_ID="${STREAM_ID:-${STREAM_PATH//\//.}}"
PUBLISH_DURATION_SECONDS="${PUBLISH_DURATION_SECONDS:-30}"
START_STACK="${START_STACK:-1}"
STOP_STACK="${STOP_STACK:-0}"
RUN_WEBRTC_ICE_SMOKE="${RUN_WEBRTC_ICE_SMOKE:-1}"
FFMPEG_IMAGE="${FFMPEG_IMAGE:-jrottenberg/ffmpeg:6.1-alpine}"
FFMPEG_PLATFORM="${FFMPEG_PLATFORM:-}"
PYTHON_IMAGE="${PYTHON_IMAGE:-python:3.12-slim}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-gcs-saker-arch-poc}"
EDGE_BASE_URL="${EDGE_BASE_URL:-http://127.0.0.1:18080}"
MEDIA_NETWORK="${MEDIA_NETWORK:-${COMPOSE_PROJECT_NAME}_media-net}"
PUBLISHER_NAME="gcs-saker-m7-publisher-$$"

usage() {
  cat <<'EOF'
Usage:
  scripts/smoke/m7_publish_play_smoke.sh [--check|--run]

Modes:
  --check  Validate the publish/play smoke contract without publishing media.
  --run    Publish a Docker ffmpeg sample stream and verify MediaMTX/HLS/WHEP paths.

Environment:
  STREAM_PATH               Default: raw/sample/front
  PUBLISH_DURATION_SECONDS  Default: 30
  START_STACK               Run m7_single_node_runtime_smoke.sh first. Default: 1
  STOP_STACK                Stop compose after the smoke. Default: 0
  RUN_WEBRTC_ICE_SMOKE      Run aiortc WHEP offer/answer smoke. Default: 1
  FFMPEG_IMAGE              Default: jrottenberg/ffmpeg:6.1-alpine
  FFMPEG_PLATFORM           Optional docker --platform value for the ffmpeg image.
  PYTHON_IMAGE              Default: python:3.12-slim
  EDGE_BASE_URL             Default: http://127.0.0.1:18080
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

wait_for_http() {
  local url="$1"
  local attempts="${2:-60}"
  local delay_seconds="${3:-1}"
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

cleanup() {
  docker rm -f "$PUBLISHER_NAME" >/dev/null 2>&1 || true
  if [[ "$STOP_STACK" == "1" ]]; then
    STOP_STACK=1 "${REPO_ROOT}/scripts/smoke/m7_single_node_runtime_smoke.sh" --run >/dev/null 2>&1 || true
  fi
}

edge_probe() {
  docker exec gcs-saker-arch-poc-edge-1 wget -q -O- "$1"
}

wait_for_mediamtx_path_ready() {
  local attempts="${1:-45}"
  local delay_seconds="${2:-1}"
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if edge_probe "http://mediamtx:9997/v3/paths/list" | grep -q "\"name\":\"${STREAM_PATH}\".*\"ready\":true"; then
      return 0
    fi
    sleep "$delay_seconds"
  done
  echo "Timed out waiting for MediaMTX path ready: ${STREAM_PATH}" >&2
  return 1
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

run_webrtc_smoke() {
  docker run --rm \
    --network "$MEDIA_NETWORK" \
    -v "${REPO_ROOT}:/workspace" \
    -w /workspace \
    "$PYTHON_IMAGE" \
    bash -lc "pip install aiortc >/tmp/aiortc-install.log && python scripts/smoke/webrtc_ice_smoke.py --run --require-video-frame --whep-url http://edge/webrtc/${STREAM_PATH}/whep --stun-url stun:turn-primary:3478"
}

run_check() {
  bash -n "$0"
  bash -n "${REPO_ROOT}/scripts/smoke/m7_single_node_runtime_smoke.sh"
  bash -n "${REPO_ROOT}/scripts/smoke/publish_sample_stream.sh"
  python3 "${REPO_ROOT}/scripts/smoke/webrtc_ice_smoke.py" --check
  python3 "${REPO_ROOT}/scripts/smoke/turn_relay_smoke.py" --check
  grep -q "WebRTC publish/play smoke" "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_publish_play_smoke.md"
  echo "M7 publish/play smoke check passed"
}

run_live() {
  require_command docker
  require_command curl
  require_command python3
  trap cleanup EXIT

  if [[ "$START_STACK" == "1" ]]; then
    "${REPO_ROOT}/scripts/smoke/m7_single_node_runtime_smoke.sh" --run
  fi

  wait_for_http "${EDGE_BASE_URL}/healthz"
  wait_for_http "${EDGE_BASE_URL}/readyz"

  local started_ms
  local mediamtx_ready_ms
  local hls_master_ready_ms
  local hls_variant_ready_ms
  local hls_master_url="${EDGE_BASE_URL}/hls/${STREAM_PATH}/index.m3u8"
  local hls_variant_url="${EDGE_BASE_URL}/hls/${STREAM_PATH}/video1_stream.m3u8"

  started_ms="$(now_ms)"
  start_publisher
  wait_for_mediamtx_path_ready 45 1
  mediamtx_ready_ms="$(now_ms)"
  wait_for_http "$hls_master_url" 60 1
  hls_master_ready_ms="$(now_ms)"
  wait_for_http "$hls_variant_url" 60 1
  hls_variant_ready_ms="$(now_ms)"

  local mediamtx_api_payload
  mediamtx_api_payload="$(edge_probe "http://mediamtx:9997/v3/paths/list")"

  if [[ "$RUN_WEBRTC_ICE_SMOKE" == "1" ]]; then
    local webrtc_started_ms
    local webrtc_finished_ms
    webrtc_started_ms="$(now_ms)"
    run_webrtc_smoke
    webrtc_finished_ms="$(now_ms)"
    echo "WebRTC smoke wall latency ms: $((webrtc_finished_ms - webrtc_started_ms))"
  fi

  echo "M7 publish/play smoke run passed"
  echo "Stream ID: ${STREAM_ID}"
  echo "Stream path: ${STREAM_PATH}"
  echo "HLS master URL: ${hls_master_url}"
  echo "MediaMTX ready latency ms: $((mediamtx_ready_ms - started_ms))"
  echo "HLS master latency ms: $((hls_master_ready_ms - started_ms))"
  echo "HLS variant latency ms: $((hls_variant_ready_ms - started_ms))"
  echo "MediaMTX API: ${mediamtx_api_payload}"
}

case "$MODE" in
  check)
    run_check
    ;;
  run)
    run_live
    ;;
esac
