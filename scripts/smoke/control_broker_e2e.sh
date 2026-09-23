#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---check}"
PROJECT="gcs-control-e2e-$$"
NETWORK="${PROJECT}-net"
BROKER="${PROJECT}-mqtt"

cleanup() {
  docker rm -f "$BROKER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}

run_check() {
  bash -n "$0"
  grep -q "TEST_CONTROL_MQTT_URL" "$REPO_ROOT/services/media-control/internal/controlintegration/control_broker_e2e_test.go"
  echo "control broker E2E contract check passed"
}

run_live() {
  command -v docker >/dev/null 2>&1 || { echo "Docker is required" >&2; exit 127; }
  trap cleanup EXIT
  docker network create --label gcs-saker.test-only=true "$NETWORK" >/dev/null
  docker run -d --name "$BROKER" --network "$NETWORK" --network-alias mqtt \
    --label gcs-saker.test-only=true \
    -v "$REPO_ROOT/deploy/mqtt-test/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro" \
    eclipse-mosquitto:2.0.22 >/dev/null
  docker run --rm --network "$NETWORK" -e TEST_CONTROL_MQTT_URL=tcp://mqtt:1883 \
    -v "$REPO_ROOT/services/media-control:/workspace:ro" -w /workspace golang:1.26.6-bookworm \
    sh -eu -c 'go test -race ./internal/controlintegration -run TestControlCommandE2EThroughRealBroker -count=1'
  echo "test-only Mosquitto control round trip passed"
}

case "$MODE" in
  --check) run_check ;;
  --run) run_live ;;
  *) echo "Usage: $0 [--check|--run]" >&2; exit 2 ;;
esac
