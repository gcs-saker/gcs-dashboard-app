#!/usr/bin/env bash
set -euo pipefail

old_ca="$(realpath "${1:?Usage: stage_internal_ca_rotation.sh <old-ca> <new-ca> <output-bundle>}")"
new_ca="$(realpath "${2:?new CA is required}")"
output="${3:?output trust bundle is required}"
[[ "${output}" = /* ]] || { echo "output trust bundle must be absolute" >&2; exit 2; }
[[ ! -e "${output}" ]] || { echo "refusing to overwrite trust bundle" >&2; exit 2; }
openssl x509 -in "${old_ca}" -noout -checkend 1209600
openssl x509 -in "${new_ca}" -noout -checkend 7776000
temporary="$(mktemp "${output}.XXXXXX")"
trap 'rm -f "${temporary}"' EXIT
awk 'NF {print}' "${old_ca}" "${new_ca}" > "${temporary}"
chmod 644 "${temporary}"
mv -f "${temporary}" "${output}"
trap - EXIT
echo "dual-trust CA bundle staged; rotate leaves before removing the old CA"
