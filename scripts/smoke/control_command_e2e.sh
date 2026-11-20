#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="check"

[[ "${1:-}" != "--run" ]] || MODE="run"
[[ "${1:-}" != "--check" ]] || MODE="check"

run_check() {
  bash -n "$0"
  grep -q "kr.co.a4ai.gcssaker.authpolicy.domain.ControlLeasePolicyTest" "$0"
  grep -q "TestControlCommandE2E" "$0"
  echo "control command E2E contract check passed"
}

run_live() {
  command -v docker >/dev/null 2>&1 || { echo "Docker is required" >&2; exit 127; }
  docker info >/dev/null
  docker run --rm -v "${REPO_ROOT}:/source:ro" \
    amazoncorretto:21@sha256:a02f509af88bd1544d5bb42be83a20d9022dc15f388a0007e2c7d0d87170b9f4 sh -eu -c '
    cp -a /source/services/auth-policy /tmp/auth-policy
    cp -a /source/contracts /tmp/contracts
    cd /tmp/auth-policy
    CONTRACTS_PROTO_DIR=/tmp/contracts/proto java -classpath gradle/wrapper/gradle-wrapper.jar \
      org.gradle.wrapper.GradleWrapperMain --no-daemon test \
      --tests kr.co.a4ai.gcssaker.authpolicy.domain.ControlLeasePolicyTest
  '
  docker run --rm -v "${REPO_ROOT}/services/media-control:/workspace:ro" \
    -w /workspace golang:1.26.11-bookworm@sha256:dc40a13b61304647ed7e5d581d246b86413dfc29d63c6d018310feb93cd98fc0 sh -eu -c '
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
