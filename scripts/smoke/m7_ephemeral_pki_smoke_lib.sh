#!/usr/bin/env bash

prepare_ephemeral_internal_pki() {
  [[ "$EPHEMERAL_INTERNAL_PKI" == "1" ]] || return 0
  [[ "$STOP_STACK" == "1" ]] || {
    echo "EPHEMERAL_INTERNAL_PKI requires STOP_STACK=1" >&2
    return 2
  }
  require_command openssl
  EPHEMERAL_PKI_DIR="$(mktemp -d)"
  local prepare_status=0
  if command -v cygpath >/dev/null 2>&1; then
    MSYS_NO_PATHCONV=1 docker run --rm \
      -e INCLUDE_MQTT_SMOKE_IDENTITY=1 \
      -e GCS_PKI_RUNTIME_GID=1000 \
      -v "$(cygpath -m "$REPO_ROOT"):/repo:ro" \
      -v "$(cygpath -m "$EPHEMERAL_PKI_DIR"):/pki" \
      -w /repo --entrypoint bash \
      postgis/postgis@sha256:44126d872ac91993766c341e369c539e8196614321765d36a6f1bab0419a5fa5 \
      scripts/ops/prepare_internal_pki.sh /pki || prepare_status=$?
  else
    INCLUDE_MQTT_SMOKE_IDENTITY=1 \
      "${REPO_ROOT}/scripts/ops/prepare_internal_pki.sh" "$EPHEMERAL_PKI_DIR" >/dev/null 2>&1 || prepare_status=$?
  fi
  if [[ "$prepare_status" -ne 0 ]]; then
    echo "Failed to generate ephemeral internal PKI" >&2
    return 1
  fi
  EPHEMERAL_PKI_VOLUME="gcs-saker-smoke-pki-$$-${RANDOM}"
  export EPHEMERAL_PKI_VOLUME
  docker volume create --label gcs-saker.ephemeral-pki=true "$EPHEMERAL_PKI_VOLUME" >/dev/null
  local pki_source_mount="$EPHEMERAL_PKI_DIR"
  if command -v cygpath >/dev/null 2>&1; then
    pki_source_mount="$(cygpath -m "$EPHEMERAL_PKI_DIR")"
  fi
  MSYS_NO_PATHCONV=1 docker run --rm \
    -v "${pki_source_mount}:/source:ro" \
    -v "${EPHEMERAL_PKI_VOLUME}:/target" \
    alpine:3.23 sh -eu -c '
      cp /source/ca.crt /source/ca.crl /source/auth-policy.crt /source/auth-policy.key \
        /source/media-control.crt /source/media-control.key \
        /source/mqtt.crt /source/mqtt.key /source/mqtt-health.crt /source/mqtt-health.key \
        /source/backend.crt /source/backend.key \
        /source/postgres.crt /source/postgres.key /source/redis.crt /source/redis.key \
        /source/turn-primary.crt /source/turn-primary.key /source/turn-secondary.crt /source/turn-secondary.key \
        /source/mqtt-device-smoke.crt /source/mqtt-device-smoke.key \
        /source/mqtt-device-other.crt /source/mqtt-device-other.key \
        /source/mqtt-device-revoked.crt /source/mqtt-device-revoked.key /target/
      chown 10002:10002 /target/auth-policy.key
      chown 10001:10001 /target/media-control.key /target/backend.key
      chown 999:999 /target/postgres.key
      chown 999:1000 /target/redis.key
      chown 65534:65534 /target/turn-primary.key /target/turn-secondary.key
      chown 1883:1883 /target/mqtt.key /target/mqtt-health.key \
        /target/mqtt-device-smoke.key /target/mqtt-device-other.key /target/mqtt-device-revoked.key
      chmod 600 /target/*.key
      chmod 644 /target/*.crt /target/*.crl
    '
  if command -v cygpath >/dev/null 2>&1; then
    export INTERNAL_PKI_DIR="$(cygpath -m "$EPHEMERAL_PKI_DIR")"
  else
    export INTERNAL_PKI_DIR="$EPHEMERAL_PKI_DIR"
  fi
  export AUTH_POLICY_AUDIT_ANCHOR_ENABLED=false
}

prepare_ephemeral_runtime_secrets() {
  [[ "$STOP_STACK" == "1" ]] || return 0
  require_command openssl
  EPHEMERAL_RUNTIME_SECRET_DIR="$(mktemp -d)"
  umask 077
  export MEDIA_CONTROL_PUBLISH_TOKEN="$(openssl rand -hex 32)"
  write_runtime_secret AUTH_JWT_SECRET "${AUTH_JWT_SECRET}"
  write_runtime_secret POSTGRES_PASSWORD "${POSTGRES_PASSWORD}"
  write_runtime_secret DATABASE_URL \
    "postgresql+psycopg2://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres-geo:5432/${POSTGRES_DB}?sslmode=verify-full&sslrootcert=/run/secrets/gcs-pki/ca.crt"
  write_runtime_secret REDIS_PASSWORD "${REDIS_PASSWORD}"
  write_runtime_secret AUTH_POLICY_RPC_TOKEN "${AUTH_POLICY_RPC_TOKEN}"
  write_runtime_secret AUTH_POLICY_AUDIT_INGEST_TOKEN "${AUTH_POLICY_AUDIT_INGEST_TOKEN}"
  write_runtime_secret MEDIA_CONTROL_GRPC_TOKEN "${MEDIA_CONTROL_GRPC_TOKEN}"
  write_runtime_secret AUTH_POLICY_ADMIN_PASSWORD "${AUTH_POLICY_ADMIN_PASSWORD}"
  write_runtime_secret AUTH_POLICY_OPERATOR_PASSWORD "${AUTH_POLICY_OPERATOR_PASSWORD}"
  write_runtime_secret AUTH_POLICY_SMOKE_PASSWORD "${AUTH_POLICY_SMOKE_PASSWORD}"
  write_runtime_secret AUTH_POLICY_ADMIN_MFA_SECRET "${AUTH_POLICY_ADMIN_MFA_SECRET}"
  write_runtime_secret AUTH_POLICY_ADMIN_MFA_RECOVERY_HASHES "${AUTH_POLICY_ADMIN_MFA_RECOVERY_HASHES}"
  write_runtime_secret AUTH_POLICY_DEVICE_BOOTSTRAP_TOKENS "${AUTH_POLICY_DEVICE_BOOTSTRAP_TOKENS}"
  write_runtime_secret AUTH_POLICY_SIGNUP_INVITES "${AUTH_POLICY_SIGNUP_INVITES:-A4AI01:1:co-a}"
  write_runtime_secret AUTH_POLICY_AUDIT_ANCHOR_HMAC_KEY "${AUTH_POLICY_AUDIT_ANCHOR_HMAC_KEY}"
  write_runtime_secret MEDIAMTX_API_PASSWORD "${MEDIAMTX_API_PASSWORD}"
  write_runtime_secret TURN_SHARED_SECRET "${TURN_SHARED_SECRET}"
  local secret_mount="$EPHEMERAL_RUNTIME_SECRET_DIR"
  if command -v cygpath >/dev/null 2>&1; then
    secret_mount="$(cygpath -m "$EPHEMERAL_RUNTIME_SECRET_DIR")"
  fi
  MSYS_NO_PATHCONV=1 docker run --rm -v "${secret_mount}:/secrets" alpine:3.23 \
    sh -ec 'chown 0:10050 /secrets/* && chmod 0440 /secrets/*'
  export GCS_RUNTIME_SECRET_DIR="$secret_mount"
}

write_runtime_secret() {
  local name="$1"
  local value="$2"
  printf '%s' "$value" >"${EPHEMERAL_RUNTIME_SECRET_DIR}/${name}"
  chmod 600 "${EPHEMERAL_RUNTIME_SECRET_DIR}/${name}"
}

cleanup_runtime_smoke() {
  local status=$?
  if [[ "$status" -ne 0 && "$STACK_STARTED" == "1" ]]; then
    echo "Local runtime smoke failed; retained service log tails follow" >&2
    compose logs --no-color --tail 80 auth-policy mqtt media-control >&2 || true
  fi
  if [[ "$STACK_STARTED" == "1" && "$STOP_STACK" == "1" ]]; then
    compose down >/dev/null 2>&1 || true
  fi
  if [[ -n "$EPHEMERAL_PKI_DIR" && -d "$EPHEMERAL_PKI_DIR" ]]; then
    local resolved
    resolved="$(realpath "$EPHEMERAL_PKI_DIR")"
    [[ "$resolved" == "$(realpath "$(dirname "$EPHEMERAL_PKI_DIR")")"/* ]] && rm -rf -- "$resolved"
  fi
  if [[ -n "$EPHEMERAL_PKI_VOLUME" ]]; then
    local ephemeral_label
    ephemeral_label="$(docker volume inspect --format '{{index .Labels "gcs-saker.ephemeral-pki"}}' \
      "$EPHEMERAL_PKI_VOLUME" 2>/dev/null || true)"
    [[ "$ephemeral_label" != "true" ]] || docker volume rm "$EPHEMERAL_PKI_VOLUME" >/dev/null 2>&1 || true
  fi
  if [[ -n "${EPHEMERAL_RUNTIME_SECRET_DIR:-}" && -d "$EPHEMERAL_RUNTIME_SECRET_DIR" ]]; then
    local secret_real
    secret_real="$(realpath "$EPHEMERAL_RUNTIME_SECRET_DIR")"
    [[ "$secret_real" == "$(realpath "$(dirname "$EPHEMERAL_RUNTIME_SECRET_DIR")")"/* ]] && rm -rf -- "$secret_real"
  fi
  return "$status"
}
