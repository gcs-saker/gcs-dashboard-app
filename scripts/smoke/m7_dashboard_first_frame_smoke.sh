#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="check"
EDGE_BASE_URL="${EDGE_BASE_URL:-http://127.0.0.1:18080}"
AUTH_BASE_PATH="${AUTH_BASE_PATH:-/auth-policy/auth}"
STREAM_API_BASE_PATH="${STREAM_API_BASE_PATH:-/media-control/api/v1}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-gcs-saker-arch-poc-backend-1}"
SEED_SMOKE_USER="${SEED_SMOKE_USER:-0}"
SMOKE_USERNAME="${SMOKE_USERNAME:-m7-smoke-viewer}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-m7-smoke-pass}"
SMOKE_STREAM_ID="${SMOKE_STREAM_ID:-raw.sample.front}"
INSECURE_TLS="${INSECURE_TLS:-0}"

usage() {
  cat <<'EOF'
Usage:
  scripts/smoke/m7_dashboard_first_frame_smoke.sh [--check|--run]

Modes:
  --check  Validate dashboard first-frame smoke selectors and documentation.
  --run    Verify the dashboard smoke page is reachable after publish/play smoke.

Environment:
  EDGE_BASE_URL  Default: http://127.0.0.1:18080
  AUTH_BASE_PATH  Default: /auth-policy/auth
  STREAM_API_BASE_PATH  Default: /media-control/api/v1
  BACKEND_CONTAINER  Default: gcs-saker-arch-poc-backend-1
  SEED_SMOKE_USER    Seed the Python runtime DB before legacy login. Default: 0
  SMOKE_USERNAME     Default: m7-smoke-viewer
  SMOKE_PASSWORD     Default: m7-smoke-pass
  SMOKE_STREAM_ID    Default: raw.sample.front
  INSECURE_TLS       Set 1 for current self-signed HTTPS staging certificate.
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

curl_tls_args() {
  if [[ "$INSECURE_TLS" == "1" ]]; then
    printf '%s\n' "-k"
  fi
}

run_check() {
  bash -n "$0"
  grep -q "data-first-frame-latency-ms" "${REPO_ROOT}/gcs-dashboard/src/features/streaming/components/WebRTCPlayer.tsx"
  grep -q "data-has-video-frame" "${REPO_ROOT}/gcs-dashboard/src/features/streaming/components/WebRTCPlayer.tsx"
  grep -q "first-frame" "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_dashboard_first_frame_smoke.md"
  grep -q "Smoke user" "${REPO_ROOT}/scripts/smoke/m7_seed_smoke_user.py"
  grep -q "playbackUrls" "$0"
  grep -q "AUTH_BASE_PATH" "$0"
  grep -q "INSECURE_TLS" "$0"
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
      python - < "${REPO_ROOT}/scripts/smoke/m7_seed_smoke_user.py"
  fi

  local login_payload
  local login_response
  export SMOKE_USERNAME
  export SMOKE_PASSWORD
  login_payload="$(python3 -c 'import json, os; print(json.dumps({"username": os.environ["SMOKE_USERNAME"], "password": os.environ["SMOKE_PASSWORD"]}))')"
  login_response="$(curl $(curl_tls_args) -fsS \
    -H "Content-Type: application/json" \
    -H "Origin: ${EDGE_BASE_URL}" \
    -H "X-GCS-CSRF: same-origin" \
    -X POST \
    --data "$login_payload" \
    "${EDGE_BASE_URL}${AUTH_BASE_PATH}/login")"

  local access_token
  access_token="$(python3 -c 'import json, sys; print(json.load(sys.stdin)["access_token"])' <<<"$login_response")"
  curl $(curl_tls_args) -fsS -H "Authorization: Bearer ${access_token}" "${EDGE_BASE_URL}${AUTH_BASE_PATH}/me" >/dev/null

  local playback_response
  playback_response="$(curl $(curl_tls_args) -fsS \
    -H "Authorization: Bearer ${access_token}" \
    "${EDGE_BASE_URL}${STREAM_API_BASE_PATH}/streams/${SMOKE_STREAM_ID}/playback")"
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

  curl $(curl_tls_args) -fsS "$smoke_url" >/dev/null
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
