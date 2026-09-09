#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
output="${1:?Usage: prepare_internal_pki.sh <absolute-output-directory>}"
[[ "${output}" = /* ]] || { echo "output directory must be absolute" >&2; exit 2; }
root_real="$(realpath "${ROOT}")"
mkdir -p "${output}"
output_real="$(realpath "${output}")"
case "${output_real}" in
  "${root_real}"|"${root_real}"/*) echo "PKI output must be outside the repository" >&2; exit 2 ;;
esac
[[ ! -e "${output_real}/ca.key" ]] || { echo "refusing to overwrite an existing CA" >&2; exit 2; }
umask 077

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "${output_real}/ca.key"
openssl req -x509 -new -sha384 -days 3650 -key "${output_real}/ca.key" \
  -subj "/CN=GCS-Saker Internal Root CA" -out "${output_real}/ca.crt"
mkdir -p "${output_real}/newcerts"
: > "${output_real}/index.txt"
printf '1000\n' > "${output_real}/serial"
printf '1000\n' > "${output_real}/crlnumber"
cat > "${output_real}/openssl-ca.cnf" <<EOF
[ca]
default_ca=CA_default
[CA_default]
dir=${output_real}
database=\$dir/index.txt
new_certs_dir=\$dir/newcerts
certificate=\$dir/ca.crt
private_key=\$dir/ca.key
serial=\$dir/serial
crlnumber=\$dir/crlnumber
default_md=sha384
default_days=90
default_crl_days=7
policy=policy_any
copy_extensions=copy
[policy_any]
commonName=supplied
[server_cert]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
[client_cert]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=clientAuth
EOF

issue_identity() {
  local name="$1" dns_name="$2" usage="$3" common_name="$4" extension=client_cert
  [[ "${usage}" == "serverAuth" ]] && extension=server_cert
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "${output_real}/${name}.key"
  openssl req -new -sha384 -key "${output_real}/${name}.key" \
    -subj "/CN=${common_name}" -addext "subjectAltName=DNS:${dns_name}" -out "${output_real}/${name}.csr"
  openssl ca -batch -config "${output_real}/openssl-ca.cnf" -extensions "${extension}" \
    -in "${output_real}/${name}.csr" -out "${output_real}/${name}.crt"
  rm -f "${output_real}/${name}.csr"
}

issue_identity auth-policy auth-policy serverAuth auth-policy
issue_identity media-control media-control clientAuth gcs_media_control
issue_identity mqtt mqtt serverAuth mqtt
issue_identity mqtt-health mqtt-health clientAuth mqtt-health
issue_identity backend backend clientAuth gcs_backend_pub
openssl ca -gencrl -config "${output_real}/openssl-ca.cnf" -out "${output_real}/ca.crl"
chmod 600 "${output_real}"/*.key
chmod 644 "${output_real}"/*.crt
echo "internal PKI created; protect ca.key offline and rotate leaf certificates within 90 days"
