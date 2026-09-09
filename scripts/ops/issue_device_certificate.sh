#!/usr/bin/env bash
set -euo pipefail

pki_dir="${1:?Usage: issue_device_certificate.sh <pki-directory> <asset-uuid>}"
asset_uuid="${2:?asset UUID is required}"
[[ "${pki_dir}" = /* && -d "${pki_dir}" ]] || { echo "PKI directory must be absolute" >&2; exit 2; }
[[ "${asset_uuid}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$ ]] || { echo "asset UUID format is invalid" >&2; exit 2; }
output="${pki_dir}/device-${asset_uuid}"
[[ ! -e "${output}.key" && ! -e "${output}.crt" ]] || { echo "refusing to overwrite device identity" >&2; exit 2; }
umask 077
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "${output}.key"
openssl req -new -sha384 -key "${output}.key" -subj "/CN=${asset_uuid}" \
  -addext "subjectAltName=URI:urn:gcs-saker:device:${asset_uuid}" -out "${output}.csr"
openssl ca -batch -config "${pki_dir}/openssl-ca.cnf" -extensions client_cert \
  -in "${output}.csr" -out "${output}.crt"
rm -f "${output}.csr"
chmod 600 "${output}.key"
chmod 644 "${output}.crt"
echo "device certificate issued; transfer it through a separate protected channel"
