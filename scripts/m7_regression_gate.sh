#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="check"
PYTHON_BIN="${PYTHON_BIN:-python3}"
BACKEND_DIR="${REPO_ROOT}/backend"
DASHBOARD_DIR="${REPO_ROOT}/gcs-dashboard"
AUTH_POLICY_DIR="${REPO_ROOT}/services/auth-policy"
MEDIA_CONTROL_DIR="${REPO_ROOT}/services/media-control"
COMPOSE_FILE="${REPO_ROOT}/deploy/compose/compose.single-node.poc.yml"
COMPOSE_ENV="${REPO_ROOT}/deploy/compose/.env.single-node.example"

usage() {
  cat <<'EOF'
Usage:
  scripts/m7_regression_gate.sh [--check|--full]

Modes:
  --check  Fast contract gate for PR iteration.
  --full   Full local regression gate for release or high-risk changes.

Environment:
  PYTHON_BIN  Python runner. Prefer python3.12 for backend checks.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      MODE="check"
      shift
      ;;
    --full)
      MODE="full"
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

run_step() {
  local label="$1"
  shift
  echo "==> ${label}"
  "$@"
}

compose_config() {
  docker compose \
    --profile geo \
    --env-file "$COMPOSE_ENV" \
    -f "$COMPOSE_FILE" \
    config --quiet
}

check_contracts() {
  test -f "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_migration_completion_gate.md"
  test -f "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_language_migration_parity_matrix.md"
  test -f "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_runtime_smoke_gate.md"
  test -f "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_publish_play_smoke.md"
  test -f "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_performance_benchmark_matrix.md"
  test -f "${REPO_ROOT}/docs/architecture/GCS-Saker_runtime_stack_status.yml"
  test -f "${REPO_ROOT}/scripts/m7_single_node_runtime_smoke.sh"
  test -f "${REPO_ROOT}/scripts/m7_publish_play_smoke.sh"
  test -f "${REPO_ROOT}/scripts/m7_dashboard_first_frame_smoke.sh"
  test -f "${REPO_ROOT}/scripts/m7_performance_benchmark_matrix.py"
  test -f "${REPO_ROOT}/scripts/grpc_runtime_smoke.py"
  test -f "${REPO_ROOT}/scripts/dragonfly_profile_smoke.py"
  test -f "${REPO_ROOT}/scripts/postgis_runtime_smoke.py"
  test -f "${REPO_ROOT}/scripts/closed_network_static_check.py"

  grep -q "v0.2.0 호환 fallback" "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_migration_completion_gate.md"
  grep -q "Spring/Kotlin" "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_language_migration_parity_matrix.md"
  grep -q "media-control" "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_language_migration_parity_matrix.md"
  grep -q "m7-performance-benchmark-v1" "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_performance_benchmark_matrix.md"
  grep -q "gcs-saker-runtime-stack-status-v1" "${REPO_ROOT}/docs/architecture/GCS-Saker_runtime_stack_status.yml"
  "${PYTHON_BIN}" "${REPO_ROOT}/scripts/grpc_runtime_smoke.py" --check >/dev/null
  "${PYTHON_BIN}" "${REPO_ROOT}/scripts/dragonfly_profile_smoke.py" --check >/dev/null
  "${PYTHON_BIN}" "${REPO_ROOT}/scripts/postgis_runtime_smoke.py" --check >/dev/null
  grep -q "backend pytest + coverage" "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_regression_gate.md"
  grep -q "frontend test coverage" "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_regression_gate.md"
  grep -q "smoke: login -> dashboard -> stream list -> playback contract" "${REPO_ROOT}/docs/architecture/GCS-Saker_M7_regression_gate.md"
}

run_check() {
  require_command bash
  require_command "$PYTHON_BIN"
  run_step "shell syntax" bash -n "$0"
  run_step "M7 regression contract" check_contracts
  run_step "closed-network static check" "$PYTHON_BIN" "${REPO_ROOT}/scripts/closed_network_static_check.py"

  if command -v docker >/dev/null 2>&1; then
    run_step "compose config" compose_config
  else
    echo "compose config skipped: docker is not installed"
  fi

  echo "M7 regression gate check passed"
}

run_backend_full() {
  run_step "backend pytest coverage" \
    "$PYTHON_BIN" -m pytest tests --cov=. --cov-report=term-missing
  run_step "backend mypy" \
    "$PYTHON_BIN" -m mypy --config-file pyproject.toml .
}

run_frontend_full() {
  run_step "frontend typecheck" npm run typecheck
  run_step "frontend test coverage" npm run test:coverage
  run_step "frontend build" npm run build
}

run_auth_policy_full() {
  run_step "auth-policy Gradle check" ./gradlew check
}

run_media_control_full() {
  run_step "media-control Go coverage" go test ./... -cover
}

run_smoke_full() {
  run_step "single-node runtime smoke check" "${REPO_ROOT}/scripts/m7_single_node_runtime_smoke.sh" --check
  run_step "publish/play smoke check" "${REPO_ROOT}/scripts/m7_publish_play_smoke.sh" --check
  run_step "dashboard first-frame smoke check" "${REPO_ROOT}/scripts/m7_dashboard_first_frame_smoke.sh" --check
}

run_full() {
  require_command "$PYTHON_BIN"
  require_command npm
  require_command go
  run_check

  (cd "$BACKEND_DIR" && run_backend_full)
  (cd "$DASHBOARD_DIR" && run_frontend_full)
  (cd "$AUTH_POLICY_DIR" && run_auth_policy_full)
  (cd "$MEDIA_CONTROL_DIR" && run_media_control_full)
  run_smoke_full

  echo "M7 regression gate full run passed"
}

case "$MODE" in
  check)
    run_check
    ;;
  full)
    run_full
    ;;
esac
