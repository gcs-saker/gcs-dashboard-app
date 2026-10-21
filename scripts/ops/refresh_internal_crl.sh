#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pki_dir="${1:?Usage: refresh_internal_crl.sh <absolute-pki-directory>}"
minimum_validity="${PKI_CRL_MIN_VALIDITY_SECONDS:-1209600}"
validity_days="${PKI_CRL_VALIDITY_DAYS:-30}"

[[ "${pki_dir}" = /* && -d "${pki_dir}" ]] || { echo "PKI directory must be absolute" >&2; exit 2; }
root_real="$(realpath "${ROOT}")"
pki_real="$(realpath "${pki_dir}")"
case "${pki_real}" in
  "${root_real}"|"${root_real}"/*) echo "PKI directory must be outside the repository" >&2; exit 2 ;;
esac
[[ "${minimum_validity}" =~ ^[0-9]+$ ]] || { echo "CRL minimum validity must be numeric" >&2; exit 2; }
[[ "${validity_days}" =~ ^[0-9]+$ && "${validity_days}" -ge 14 && "${validity_days}" -le 365 ]] || {
  echo "CRL validity days must be between 14 and 365" >&2
  exit 2
}
for required in ca.crt ca.key openssl-ca.cnf index.txt crlnumber; do
  [[ -s "${pki_real}/${required}" ]] || { echo "missing CA state: ${required}" >&2; exit 1; }
done

umask 077
temporary="$(mktemp "${pki_real}/ca.crl.XXXXXX")"
trap 'rm -f "${temporary}"' EXIT
openssl ca -batch -gencrl -crldays "${validity_days}" -config "${pki_real}/openssl-ca.cnf" -out "${temporary}"
next_update="$(openssl crl -in "${temporary}" -noout -nextupdate | sed 's/^nextUpdate=//')"
next_update_epoch="$(date -u -d "${next_update}" +%s)"
minimum_epoch="$(( $(date -u +%s) + minimum_validity ))"
(( next_update_epoch >= minimum_epoch )) || {
  echo "new CRL does not satisfy the minimum validity window" >&2
  exit 1
}
chmod 644 "${temporary}"
mv -f "${temporary}" "${pki_real}/ca.crl"
trap - EXIT
echo "internal CRL replaced atomically"
