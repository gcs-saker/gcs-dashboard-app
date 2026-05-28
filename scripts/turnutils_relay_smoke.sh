#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-gcs-dashboard/.env}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-8}"
DOCKER_CMD="${DOCKER_CMD:-docker}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "missing env file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

if [[ -z "${WEBRTC_TURN_USERNAME:-}" || -z "${WEBRTC_TURN_PASSWORD:-}" ]]; then
  echo "WEBRTC_TURN_USERNAME and WEBRTC_TURN_PASSWORD are required" >&2
  exit 1
fi

TURN_CONTAINER_NAME="${TURN_CONTAINER_NAME:-${COMPOSE_PROJECT_NAME:-gcs-saker}-turn}"
TURN_HOST="${TURN_HOST:-$(python3 - <<'PY'
import os
from urllib.parse import urlparse

value = os.environ.get("WEBRTC_TURN_URL", "turn:127.0.0.1:3478?transport=udp")
parsed = urlparse(value)
if parsed.hostname:
    print(parsed.hostname)
else:
    print(value.removeprefix("turn:").partition("?")[0].rpartition(":")[0] or "127.0.0.1")
PY
)}"
export DOCKER_CMD TURN_CONTAINER_NAME TURN_HOST WEBRTC_TURN_USERNAME WEBRTC_TURN_PASSWORD TURN_PORT

docker_cmd() {
  # Intentionally allow DOCKER_CMD="sudo docker" on locked-down servers.
  # shellcheck disable=SC2086
  ${DOCKER_CMD} "$@"
}

before_count="$(docker_cmd logs --since 5m "${TURN_CONTAINER_NAME}" 2>/dev/null | grep -c "Global turn allocation count incremented" || true)"

set +e
timeout "${TIMEOUT_SECONDS}" bash -c '
  # shellcheck disable=SC2086
  ${DOCKER_CMD} exec "${TURN_CONTAINER_NAME}" \
    turnutils_uclient -y -c \
    -u "${WEBRTC_TURN_USERNAME}" \
    -w "${WEBRTC_TURN_PASSWORD}" \
    -p "${TURN_PORT:-3478}" \
    "${TURN_HOST}"
' >/tmp/gcs-saker-turnutils-smoke.log 2>&1
set -e

after_count="$(docker_cmd logs --since 5m "${TURN_CONTAINER_NAME}" 2>/dev/null | grep -c "Global turn allocation count incremented" || true)"

if (( after_count <= before_count )); then
  echo "TURN relay smoke failed: allocation count did not increase" >&2
  tail -40 /tmp/gcs-saker-turnutils-smoke.log >&2 || true
  exit 1
fi

echo "TURN relay smoke passed"
echo "TURN host: ${TURN_HOST}"
echo "TURN container: ${TURN_CONTAINER_NAME}"
echo "Allocation increments: $((after_count - before_count))"
