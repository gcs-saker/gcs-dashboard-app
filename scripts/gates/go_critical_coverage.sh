#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODULE="${ROOT}/services/media-control"

check_package() {
  local package="$1" floor="$2" profile output coverage
  profile="$(mktemp)"
  trap 'rm -f "${profile}"' RETURN
  output="$(cd "${MODULE}" && go test -coverprofile="${profile}" "${package}")"
  printf '%s\n' "${output}"
  coverage="$(cd "${MODULE}" && go tool cover -func="${profile}" | awk '/^total:/ {gsub(/%/, "", $3); print $3}')"
  awk -v coverage="${coverage}" -v floor="${floor}" 'BEGIN { exit !(coverage + 0 >= floor + 0) }' || {
    echo "coverage floor failed: ${package} ${coverage}% < ${floor}%" >&2
    exit 1
  }
  echo "coverage floor passed: ${package} ${coverage}% >= ${floor}%"
  rm -f "${profile}"
  trap - RETURN
}

check_package ./internal/sessiontoken 80
check_package ./internal/mqttgateway 30
