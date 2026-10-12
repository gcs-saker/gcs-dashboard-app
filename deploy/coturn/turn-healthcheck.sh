#!/bin/sh
set -eu

health_host="${TURN_HEALTH_HOST:-127.0.0.1}"
health_port="${TURN_HEALTH_PORT:-3478}"

case "${health_port}" in
  ''|*[!0-9]*)
    echo "TURN health port must be numeric" >&2
    exit 2
    ;;
esac

turnutils_stunclient -p "${health_port}" -t 1500 "${health_host}" >/dev/null 2>&1
