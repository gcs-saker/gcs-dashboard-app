#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
host="${1:-gcs-saker.com}"
port="${2:-443}"
compose="${ROOT}/deploy/compose/compose.single-node.poc.yml"
mosquitto="${ROOT}/deploy/mosquitto/mosquitto.hardened.conf"

require_text() {
  local text="$1" file="$2"
  grep -Fq -- "${text}" "${file}" || { echo "secure channel contract missing: ${text}" >&2; exit 1; }
}

require_text 'GCS_INTERNAL_GRPC_CA_FILE: /run/secrets/gcs-pki/ca.crt' "${compose}"
require_text 'AUTH_POLICY_GRPC_SERVER_NAME: auth-policy' "${compose}"
require_text 'MQTT_TLS_ENABLED: "true"' "${compose}"
require_text 'listener 8883 0.0.0.0' "${mosquitto}"
require_text 'require_certificate true' "${mosquitto}"
require_text 'tls_version tlsv1.3' "${mosquitto}"

for obsolete in -tls1 -tls1_1; do
  if echo | openssl s_client "${obsolete}" -connect "${host}:${port}" -servername "${host}" 2>/dev/null \
    | grep -q '^ *Protocol *:'; then
    echo "public endpoint accepted obsolete TLS: ${obsolete}" >&2
    exit 1
  fi
done
echo | openssl s_client -tls1_2 -connect "${host}:${port}" -servername "${host}" 2>/dev/null \
  | grep -Eq 'Protocol *: TLSv1\.2|New, TLSv1\.2' || { echo "TLS 1.2 negotiation failed" >&2; exit 1; }
echo | openssl s_client -tls1_3 -connect "${host}:${port}" -servername "${host}" 2>/dev/null \
  | grep -Eq 'Protocol *: TLSv1\.3|New, TLSv1\.3' || { echo "TLS 1.3 negotiation failed" >&2; exit 1; }

echo "secure channel and public cipher protocol checks passed"
