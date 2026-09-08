#!/bin/sh
set -eu

resolve_ipv4() {
  getent hosts "$1" | awk '$1 ~ /^[0-9]+(\.[0-9]+){3}$/ { print $1; exit }'
}

mediamtx_ip="$(resolve_ipv4 "${TURN_MEDIA_PEER_SERVICE:-mediamtx}")"
self_ip="$(hostname -i | tr ' ' '\n' | awk '/^[0-9]+(\.[0-9]+){3}$/ { print; exit }')"

if [ -z "${mediamtx_ip}" ] || [ -z "${self_ip}" ] || [ "${mediamtx_ip}" = "${self_ip}" ]; then
  echo "TURN peer reference resolution failed" >&2
  exit 1
fi

exec turnserver "$@" \
  "--allowed-peer-ip=${mediamtx_ip}" \
  "--allowed-peer-ip=${self_ip}"
