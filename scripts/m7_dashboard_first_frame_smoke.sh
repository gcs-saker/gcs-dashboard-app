#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="check"
EDGE_BASE_URL="${EDGE_BASE_URL:-http://127.0.0.1:18080}"

usage() {
  cat <<'EOF'
Usage:
  scripts/m7_dashboard_first_frame_smoke.sh [--check|--run]

Modes:
  --check  Validate dashboard first-frame smoke selectors and documentation.
  --run    Verify the dashboard smoke page is reachable after publish/play smoke.

Environment:
  EDGE_BASE_URL  Default: http://127.0.0.1:18080
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
  echo "M7 dashboard first-frame smoke check passed"
}

run_live() {
  require_command curl
  local smoke_url="${EDGE_BASE_URL}/?streamingSmoke=1"
  curl -fsS "$smoke_url" >/dev/null
  echo "M7 dashboard first-frame smoke run passed"
  echo "Dashboard smoke URL: ${smoke_url}"
  echo "Auth note: browser route is protected and redirects to /login until a smoke user session exists."
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
