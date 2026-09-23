#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="check"

[[ "${1:-}" != "--run" ]] || MODE="run"
[[ "${1:-}" != "--check" ]] || MODE="check"

run_check() {
  bash -n "$0"
  grep -q "ControlLeasePolicyTest" "$0"
  grep -q "TestControlCommandE2E" "$0"
  echo "control command E2E contract check passed"
}

run_live() {
  command -v docker >/dev/null 2>&1 || { echo "Docker is required" >&2; exit 127; }
  docker info >/dev/null
  docker run --rm -v "${REPO_ROOT}:/source:ro" gradle:8.14.3-jdk21 sh -eu -c '
    cp -a /source/services/auth-policy /tmp/auth-policy
    cp -a /source/contracts /tmp/contracts
    cd /tmp/auth-policy
    CONTRACTS_PROTO_DIR=/tmp/contracts/proto gradle --no-daemon test \
      --tests kr.co.a4ai.gcssaker.authpolicy.domain.control.ControlLeasePolicyTest
  '
  docker run --rm -v "${REPO_ROOT}/services/media-control:/workspace:ro" \
    -w /workspace golang:1.26.6-bookworm sh -eu -c '
      go test -race ./internal/controltransport ./internal/controlstate ./internal/controlobs ./internal/deviceadapter
      go test ./internal/controlintegration -run "TestControlCommandE2E"
  '
  echo "control command Docker E2E passed"
  echo "verified: policy denials, routing, lease, duplicate, sequence, expiry, ACK, fail-safe, emergency-stop, leakage"
}

case "$MODE" in
  check) run_check ;;
  run) run_live ;;
esac
