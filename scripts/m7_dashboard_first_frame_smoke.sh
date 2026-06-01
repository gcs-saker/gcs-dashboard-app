#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="check"
EDGE_BASE_URL="${EDGE_BASE_URL:-http://127.0.0.1:18080}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-gcs-saker-arch-poc-backend-1}"
SEED_SMOKE_USER="${SEED_SMOKE_USER:-1}"
SMOKE_USERNAME="${SMOKE_USERNAME:-m7-smoke-viewer}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-m7-smoke-pass}"
SMOKE_STREAM_ID="${SMOKE_STREAM_ID:-raw.sample.front}"

usage() {
  cat <<'EOF'
Usage:
  scripts/m7_dashboard_first_frame_smoke.sh [--check|--run]

Modes:
  --check  Validate dashboard first-frame smoke selectors and documentation.
  --run    Verify the dashboard smoke page is reachable after publish/play smoke.

Environment:
  EDGE_BASE_URL  Default: http://127.0.0.1:18080
  BACKEND_CONTAINER  Default: gcs-saker-arch-poc-backend-1
  SEED_SMOKE_USER    Seed the runtime DB before login. Default: 1
  SMOKE_USERNAME     Default: m7-smoke-viewer
  SMOKE_PASSWORD     Default: m7-smoke-pass
  SMOKE_STREAM_ID    Default: raw.sample.front
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

run_check() {
  bash -n "$0"
  grep -q "data-first-frame-latency-ms" "${REPO_ROOT}/gcs-dashboard/src/features/streaming/components/WebRTCPlayer.tsx"
  grep -q "data-has-video-frame" "${REPO_ROOT}/gcs-dashboard/src/features/streaming/components/WebRTCPlayer.tsx"
  grep -q "first-frame" "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_dashboard_first_frame_smoke.md"
  grep -q "Smoke user" "${REPO_ROOT}/scripts/m7_seed_smoke_user.py"
  grep -q "playbackUrls" "$0"
  echo "M7 dashboard first-frame smoke check passed"
}

run_live() {
  require_command curl
  require_command docker
  require_command python3
  local smoke_url="${EDGE_BASE_URL}/?streamingSmoke=1"

  if [[ "$SEED_SMOKE_USER" == "1" ]]; then
    docker exec -i \
      -e SMOKE_USERNAME="$SMOKE_USERNAME" \
      -e SMOKE_PASSWORD="$SMOKE_PASSWORD" \
      "$BACKEND_CONTAINER" \
      python - < "${REPO_ROOT}/scripts/m7_seed_smoke_user.py"
  fi

  local login_payload
  local login_response
  export SMOKE_USERNAME
  export SMOKE_PASSWORD
  login_payload="$(python3 -c 'import json, os; print(json.dumps({"username": os.environ["SMOKE_USERNAME"], "password": os.environ["SMOKE_PASSWORD"]}))')"
  login_response="$(curl -fsS \
    -H "Content-Type: application/json" \
    -X POST \
    --data "$login_payload" \
    "${EDGE_BASE_URL}/api/auth/login")"

  local access_token
  access_token="$(python3 -c 'import json, sys; print(json.load(sys.stdin)["access_token"])' <<<"$login_response")"
  curl -fsS -H "Authorization: Bearer ${access_token}" "${EDGE_BASE_URL}/api/auth/me" >/dev/null

  local playback_response
  playback_response="$(curl -fsS \
    -H "Authorization: Bearer ${access_token}" \
    "${EDGE_BASE_URL}/api/v1/streams/${SMOKE_STREAM_ID}/playback")"
  local whep_url
  whep_url="$(EDGE_BASE_URL="$EDGE_BASE_URL" python3 -c '
import json
import os
import sys

payload = json.load(sys.stdin)
edge_base_url = os.environ["EDGE_BASE_URL"].rstrip("/")
playback_urls = payload["playbackUrls"]
expected_webrtc_prefix = f"{edge_base_url}/webrtc/"
expected_hls_prefix = f"{edge_base_url}/hls/"
whep_url = playback_urls["webrtc"]
hls_url = playback_urls["hls"]

if not whep_url.startswith(expected_webrtc_prefix):
    raise SystemExit(f"Unexpected WHEP URL: {whep_url}")
if not hls_url.startswith(expected_hls_prefix):
    raise SystemExit(f"Unexpected HLS URL: {hls_url}")
print(whep_url)
' <<<"$playback_response")"

  curl -fsS "$smoke_url" >/dev/null
  echo "M7 dashboard first-frame smoke run passed"
  echo "Dashboard smoke URL: ${smoke_url}"
  echo "Smoke user login API: ok (${SMOKE_USERNAME})"
  echo "Playback WHEP URL: ${whep_url}"
  echo "Browser selector: [data-testid='webrtc-player'][data-has-video-frame='true']"
  echo "Latency attribute: data-first-frame-latency-ms"
}

case "$MODE" in
  check)
    run_check
    ;;
  run)
    run_live
    ;;
esac
