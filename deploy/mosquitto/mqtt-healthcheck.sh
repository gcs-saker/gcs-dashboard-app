#!/bin/sh
set -eu

output="$({
  mosquitto_sub \
    -h "${MQTT_HEALTH_HOST:-mqtt}" \
    -p "${MQTT_HEALTH_PORT:-8883}" \
    --cafile /run/secrets/gcs-pki/ca.crt \
    --cert /run/secrets/gcs-pki/mqtt-health.crt \
    --key /run/secrets/gcs-pki/mqtt-health.key \
    -t '$SYS/broker/version' -C 1 -W 3
} 2>&1)" && exit 0

case "${output}" in
  *"certificate expired"*) reason="certificate_or_crl_expired" ;;
  *"certificate revoked"*) reason="certificate_revoked" ;;
  *"unknown ca"*|*"self-signed certificate"*) reason="ca_untrusted" ;;
  *"not authorised"*|*"not authorized"*) reason="acl_or_identity_denied" ;;
  *"Connection refused"*) reason="listener_unavailable" ;;
  *) reason="secure_probe_failed" ;;
esac
echo "MQTT health failed: ${reason}" >&2
exit 1
