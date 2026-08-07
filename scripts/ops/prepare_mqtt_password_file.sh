#!/usr/bin/env bash
set -euo pipefail

password_file="${1:?usage: prepare_mqtt_password_file.sh <password-file>}"
mosquitto_uid="${MOSQUITTO_RUNTIME_UID:-1883}"

[[ "${password_file}" = /* && -s "${password_file}" ]] || {
  echo "password file must be an existing non-empty absolute path" >&2
  exit 2
}
command -v setfacl >/dev/null || {
  echo "setfacl is required; install the acl package" >&2
  exit 2
}

chmod 600 "${password_file}"
setfacl -m "u:${mosquitto_uid}:r--" "${password_file}"
getfacl --absolute-names --omit-header "${password_file}" | grep -Fx "user:${mosquitto_uid}:r--" >/dev/null

echo "Mosquitto password ACL prepared for runtime uid ${mosquitto_uid}"
