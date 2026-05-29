#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="check"
EDGE_BASE_URL="${EDGE_BASE_URL:-http://127.0.0.1:18080}"
AUTH_POLICY_BASE_PATH="${AUTH_POLICY_BASE_PATH:-/auth-policy/auth}"
SMOKE_USERNAME="${SMOKE_USERNAME:-operator01}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-correct-password}"

usage() {
  cat <<'EOF'
Usage:
  scripts/m7_auth_policy_cutover_smoke.sh [--check|--run]

Modes:
  --check  Validate Spring/Kotlin auth-policy cutover contracts.
  --run    Verify login/refresh/me/logout through the edge auth-policy route.

Environment:
  EDGE_BASE_URL          Default: http://127.0.0.1:18080
  AUTH_POLICY_BASE_PATH  Default: /auth-policy/auth
  SMOKE_USERNAME         Default: operator01
  SMOKE_PASSWORD         Default: correct-password
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
  grep -q "class AuthController" "${REPO_ROOT}/services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/api/AuthController.kt"
  grep -q "@PostMapping(\"/login\")" "${REPO_ROOT}/services/auth-policy/src/main/kotlin/kr/co/a4ai/gcssaker/authpolicy/api/AuthController.kt"
  grep -q "VITE_AUTH_API_BASE_URL" "${REPO_ROOT}/gcs-dashboard/src/config.ts"
  grep -q "location /auth-policy/" "${REPO_ROOT}/deploy/nginx/single-node.poc.conf"
  grep -q "AUTH_POLICY_ALLOWED_ORIGINS" "${REPO_ROOT}/deploy/compose/compose.single-node.poc.yml"
  echo "M7 auth-policy cutover smoke check passed"
}

run_live() {
  require_command curl
  require_command python3

  local auth_base="${EDGE_BASE_URL%/}${AUTH_POLICY_BASE_PATH}"
  local cookie_jar
  cookie_jar="$(mktemp -t gcs-saker-auth-policy-cookies.XXXXXX)"
  cleanup_cookie_jar() {
    rm -f "$cookie_jar"
  }
  trap cleanup_cookie_jar EXIT

  local login_payload
  local login_response
  export SMOKE_USERNAME
  export SMOKE_PASSWORD
  login_payload="$(python3 -c 'import json, os; print(json.dumps({"username": os.environ["SMOKE_USERNAME"], "password": os.environ["SMOKE_PASSWORD"]}))')"
  login_response="$(curl -fsS \
    -c "$cookie_jar" \
    -H "Content-Type: application/json" \
    -H "Origin: ${EDGE_BASE_URL}" \
    -X POST \
    --data "$login_payload" \
    "${auth_base}/login")"

  local access_token
  access_token="$(python3 -c 'import json, sys; payload=json.load(sys.stdin); assert payload["token_type"] == "bearer"; print(payload["access_token"])' <<<"$login_response")"
  curl -fsS -H "Authorization: Bearer ${access_token}" "${auth_base}/me" >/dev/null

  local refresh_response
  refresh_response="$(curl -fsS \
    -b "$cookie_jar" \
    -c "$cookie_jar" \
    -H "Accept: application/json" \
    -H "Origin: ${EDGE_BASE_URL}" \
    -X POST \
    "${auth_base}/refresh")"
  python3 -c 'import json, sys; payload=json.load(sys.stdin); assert payload["access_token"]; assert payload["username"]' <<<"$refresh_response" >/dev/null

  local logout_status
  logout_status="$(curl -fsS \
    -o /dev/null \
    -w "%{http_code}" \
    -b "$cookie_jar" \
    -H "Origin: ${EDGE_BASE_URL}" \
    -X POST \
    "${auth_base}/logout")"
  if [[ "$logout_status" != "204" ]]; then
    echo "Unexpected logout status: ${logout_status}" >&2
    exit 1
  fi

  echo "M7 auth-policy cutover smoke run passed"
  echo "Auth policy URL: ${auth_base}"
  echo "Verified: login, me, refresh rotation, logout"
  cleanup_cookie_jar
  trap - EXIT
}

case "$MODE" in
  check)
    run_check
    ;;
  run)
    run_live
    ;;
esac
