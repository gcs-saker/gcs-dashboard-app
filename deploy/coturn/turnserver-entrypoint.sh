#!/bin/sh
set -eu

secret_file="/run/secrets/TURN_SHARED_SECRET"
runtime_config="/tmp/turn-secret.conf"
[ -f "${secret_file}" ] || { echo "TURN shared secret is missing" >&2; exit 1; }
secret="$(cat "${secret_file}")"
secret_size="${#secret}"
if [ "${secret_size}" -lt 32 ] || [ "${secret_size}" -gt 4096 ]; then
  echo "TURN shared secret size is invalid" >&2
  exit 1
fi
case "${secret}" in
  ''|*[!A-Za-z0-9_-]*) echo "TURN shared secret format is invalid" >&2; exit 1 ;;
esac
umask 077
printf 'static-auth-secret=%s\n' "${secret}" > "${runtime_config}"

resolve_ipv4() {
  getent hosts "$1" | awk '$1 ~ /^[0-9]+(\.[0-9]+){3}$/ { print $1; exit }'
}

mediamtx_ip="$(resolve_ipv4 "${TURN_MEDIA_PEER_SERVICE:-mediamtx}")"
self_ip="$(hostname -i | tr ' ' '\n' | awk '/^[0-9]+(\.[0-9]+){3}$/ { print; exit }')"

if [ -z "${mediamtx_ip}" ] || [ -z "${self_ip}" ] || [ "${mediamtx_ip}" = "${self_ip}" ]; then
  echo "TURN peer reference resolution failed" >&2
  exit 1
fi

exec turnserver -c "${runtime_config}" "$@" \
  "--allowed-peer-ip=${mediamtx_ip}" \
  "--allowed-peer-ip=${self_ip}"
