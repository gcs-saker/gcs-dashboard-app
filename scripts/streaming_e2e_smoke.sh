#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="check"
STREAM_ID="${STREAM_ID:-raw.sample.front}"
STREAM_PATH="${STREAM_PATH:-raw/sample/front}"
BACKEND_PORT="${BACKEND_PORT:-18024}"
DASHBOARD_PORT="${DASHBOARD_PORT:-18023}"
SMOKE_DURATION_SECONDS="${SMOKE_DURATION_SECONDS:-20}"
WEBRTC_BASE_URL="${MEDIAMTX_PUBLIC_WEBRTC_BASE_URL:-http://127.0.0.1:8889}"
HLS_BASE_URL="${MEDIAMTX_PUBLIC_HLS_BASE_URL:-http://127.0.0.1:8888}"
WEBRTC_ICE_SMOKE="${WEBRTC_ICE_SMOKE:-0}"
WEBRTC_STUN_URL="${VITE_WEBRTC_STUN_URL:-stun:localhost:3478}"
WEBRTC_ICE_INSECURE="${WEBRTC_ICE_INSECURE:-0}"
WEBRTC_REQUIRE_CONNECTED="${WEBRTC_REQUIRE_CONNECTED:-0}"
BACKEND_PID=""
DASHBOARD_PID=""
PUBLISH_PID=""

usage() {
  cat <<'EOF'
Usage:
  scripts/streaming_e2e_smoke.sh [--check|--run]

Modes:
  --check    Validate scripts, dry-run commands, and documented smoke-test contract.
  --run      Start MediaMTX/backend/dashboard, publish sample stream, and probe playback URLs.

Environment:
  STREAM_ID                       Default: raw.sample.front
  STREAM_PATH                     Default: raw/sample/front
  BACKEND_PORT                    Default: 18024
  DASHBOARD_PORT                  Default: 18023
  SMOKE_DURATION_SECONDS          Default: 20
  MEDIAMTX_PUBLIC_WEBRTC_BASE_URL Default: http://127.0.0.1:8889
  MEDIAMTX_PUBLIC_HLS_BASE_URL    Default: http://127.0.0.1:8888
  WEBRTC_ICE_SMOKE                Default: 0. Set 1 to run live WHEP offer/answer ICE smoke.
  VITE_WEBRTC_STUN_URL            Default: stun:localhost:3478
  WEBRTC_ICE_INSECURE             Default: 0. Set 1 for self-signed HTTPS WHEP endpoints.
  WEBRTC_REQUIRE_CONNECTED        Default: 0. Set 1 to require ICE connected/completed.
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

wait_for_http() {
  local url="$1"
  local attempts="${2:-30}"
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
  if [[ -n "$PUBLISH_PID" ]]; then
    kill "$PUBLISH_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$DASHBOARD_PID" ]]; then
    kill "$DASHBOARD_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$BACKEND_PID" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}

run_check() {
  bash -n "${REPO_ROOT}/scripts/publish_sample_stream.sh"
  bash -n "${REPO_ROOT}/scripts/streaming_e2e_smoke.sh"
  python3 "${REPO_ROOT}/scripts/webrtc_ice_smoke.py" --check

  local dry_run
  dry_run="$("${REPO_ROOT}/scripts/publish_sample_stream.sh" --dry-run)"
  [[ "$dry_run" == *"rtsp://127.0.0.1:8554/${STREAM_PATH}"* ]]
  [[ "$dry_run" == *"testsrc2=size=1280x720:rate=30"* ]]

  grep -q "raw.sample.front" "${REPO_ROOT}/docs/m1/streaming-e2e-smoke-test.md"
  grep -q "streamingSmoke=1" "${REPO_ROOT}/docs/m1/streaming-e2e-smoke-test.md"
  grep -q "HLS fallback" "${REPO_ROOT}/docs/m1/streaming-e2e-smoke-test.md"
  grep -q "STUN" "${REPO_ROOT}/docs/m1/streaming-e2e-smoke-test.md"
  grep -q "WHEP offer/answer" "${REPO_ROOT}/docs/m1/streaming-e2e-smoke-test.md"
  grep -q "ICE candidate" "${REPO_ROOT}/docs/m1/streaming-e2e-smoke-test.md"

  echo "Streaming E2E smoke check passed"
  echo "Sample dry-run: ${dry_run}"
}

run_smoke() {
  require_command docker
  require_command curl
  require_command ffmpeg
  require_command npm

  trap cleanup EXIT

  docker compose --project-directory "${REPO_ROOT}/gcs-dashboard" up -d mediamtx

  (
    cd "${REPO_ROOT}/backend"
    MEDIAMTX_PUBLIC_WEBRTC_BASE_URL="$WEBRTC_BASE_URL" \
      MEDIAMTX_PUBLIC_HLS_BASE_URL="$HLS_BASE_URL" \
      ../.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port "$BACKEND_PORT"
  ) &
  BACKEND_PID="$!"
  wait_for_http "http://127.0.0.1:${BACKEND_PORT}/api/v1/streams/${STREAM_ID}/playback"

  "${REPO_ROOT}/scripts/publish_sample_stream.sh" --duration "$SMOKE_DURATION_SECONDS" &
  PUBLISH_PID="$!"

  local playback_url="http://127.0.0.1:${BACKEND_PORT}/api/v1/streams/${STREAM_ID}/playback"
  local playback_payload
  playback_payload="$(curl -fsS "$playback_url")"
  [[ "$playback_payload" == *"\"webrtc\":\"${WEBRTC_BASE_URL}/${STREAM_PATH}/whep\""* ]]
  [[ "$playback_payload" == *"\"hls\":\"${HLS_BASE_URL}/${STREAM_PATH}/index.m3u8\""* ]]

  wait_for_http "${HLS_BASE_URL}/${STREAM_PATH}/index.m3u8" 45 1

  if [[ "$WEBRTC_ICE_SMOKE" == "1" ]]; then
    ice_args=(
      --run
      --whep-url "${WEBRTC_BASE_URL}/${STREAM_PATH}/whep"
      --stun-url "$WEBRTC_STUN_URL"
    )
    if [[ "$WEBRTC_ICE_INSECURE" == "1" ]]; then
      ice_args+=(--insecure)
    fi
    if [[ "$WEBRTC_REQUIRE_CONNECTED" == "1" ]]; then
      ice_args+=(--require-connected)
    fi
    python3 "${REPO_ROOT}/scripts/webrtc_ice_smoke.py" "${ice_args[@]}"
  fi

  (
    cd "${REPO_ROOT}/gcs-dashboard"
    VITE_API_BASE_URL="http://127.0.0.1:${BACKEND_PORT}/api" npm run dev -- --port "$DASHBOARD_PORT"
  ) &
  DASHBOARD_PID="$!"
  wait_for_http "http://127.0.0.1:${DASHBOARD_PORT}/?streamingSmoke=1"

  echo "Streaming E2E smoke run passed"
  echo "Playback API: ${playback_payload}"
  echo "Dashboard smoke URL: http://127.0.0.1:${DASHBOARD_PORT}/?streamingSmoke=1"
}

case "$MODE" in
  check)
    run_check
    ;;
  run)
    run_smoke
    ;;
esac
