#!/usr/bin/env bash
set -euo pipefail

pki_dir="${1:?Usage: revoke_internal_certificate.sh <pki-directory> <certificate-file>}"
certificate="$(realpath "${2:?certificate file is required}")"
pki_real="$(realpath "${pki_dir}")"
case "${certificate}" in
  "${pki_real}"/*.crt) ;;
  *) echo "certificate must be an exact file inside the PKI directory" >&2; exit 2 ;;
esac
[[ "${certificate}" != "${pki_real}/ca.crt" ]] || { echo "root CA revocation requires CA rotation procedure" >&2; exit 2; }
openssl ca -config "${pki_real}/openssl-ca.cnf" -revoke "${certificate}"
temporary="$(mktemp "${pki_real}/ca.crl.XXXXXX")"
trap 'rm -f "${temporary}"' EXIT
openssl ca -gencrl -config "${pki_real}/openssl-ca.cnf" -out "${temporary}"
chmod 644 "${temporary}"
mv -f "${temporary}" "${pki_real}/ca.crl"
trap - EXIT
echo "certificate revoked and CRL replaced atomically"
