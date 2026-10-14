#!/usr/bin/env bash
set -euo pipefail

pki_dir="${1:?Usage: check_internal_pki.sh <absolute-pki-directory>}"
warn_seconds="${PKI_EXPIRY_WARN_SECONDS:-1209600}"
runtime_gid="${GCS_PKI_RUNTIME_GID:-1000}"
[[ "${pki_dir}" = /* && -d "${pki_dir}" ]] || { echo "PKI directory must be absolute" >&2; exit 2; }
[[ "${runtime_gid}" =~ ^[0-9]+$ ]] || { echo "PKI runtime GID must be numeric" >&2; exit 2; }
[[ -s "${pki_dir}/ca.crl" ]] || { echo "certificate revocation list is missing" >&2; exit 1; }
next_update="$(openssl crl -in "${pki_dir}/ca.crl" -noout -nextupdate | sed 's/^nextUpdate=//')"
next_update_epoch="$(date -u -d "${next_update}" +%s)"
minimum_epoch="$(( $(date -u +%s) + warn_seconds ))"
(( next_update_epoch >= minimum_epoch )) || {
  echo "certificate revocation list expires within warning window" >&2
  exit 1
}

for name in auth-policy media-control mqtt mqtt-health backend; do
  cert="${pki_dir}/${name}.crt"
  key="${pki_dir}/${name}.key"
  [[ -s "${cert}" && -s "${key}" ]] || { echo "missing identity: ${name}" >&2; exit 1; }
  openssl verify -CAfile "${pki_dir}/ca.crt" -CRLfile "${pki_dir}/ca.crl" -crl_check "${cert}" >/dev/null
  openssl x509 -checkend "${warn_seconds}" -noout -in "${cert}" >/dev/null || {
    echo "certificate expires within warning window: ${name}" >&2
    exit 1
  }
  mode="$(stat -c '%a' "${key}")"
  group_id="$(stat -c '%g' "${key}")"
  case "${mode}" in
    600|400) ;;
    640|440)
      [[ "${group_id}" == "${runtime_gid}" ]] || {
        echo "private key runtime group is unsafe: ${name}" >&2
        exit 1
      }
      ;;
    *) echo "private key mode is unsafe: ${name}" >&2; exit 1 ;;
  esac
done

echo "internal PKI chain, key permissions, and expiry checks passed"
