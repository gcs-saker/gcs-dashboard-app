#!/bin/sh
set -eu

secret_file="/run/secrets/REDIS_PASSWORD"
config_file="/tmp/valkey-secret.conf"

if [ ! -f "${secret_file}" ]; then
  echo "Redis password secret is missing" >&2
  exit 1
fi
secret_size="$(wc -c < "${secret_file}")"
if [ "${secret_size}" -eq 0 ] || [ "${secret_size}" -gt 4096 ]; then
  echo "Redis password secret size is invalid" >&2
  exit 1
fi
password="$(cat "${secret_file}")"
carriage_return="$(printf '\r')"
case "${password}" in
  *"
"*|*"${carriage_return}"*) echo "Redis password secret must be one line" >&2; exit 1 ;;
esac
escaped="$(printf '%s' "${password}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
umask 077
printf 'requirepass "%s"\n' "${escaped}" > "${config_file}"
chown valkey:valkey "${config_file}"
chmod 0400 "${config_file}"

exec /usr/local/bin/docker-entrypoint.sh valkey-server "${config_file}" "$@"
