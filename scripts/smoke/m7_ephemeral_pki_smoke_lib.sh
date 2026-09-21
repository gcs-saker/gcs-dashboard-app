#!/usr/bin/env bash

prepare_ephemeral_internal_pki() {
  [[ "$EPHEMERAL_INTERNAL_PKI" == "1" ]] || return 0
  [[ "$STOP_STACK" == "1" ]] || {
    echo "EPHEMERAL_INTERNAL_PKI requires STOP_STACK=1" >&2
    return 2
  }
  require_command openssl
  EPHEMERAL_PKI_DIR="$(mktemp -d)"
  if ! "${REPO_ROOT}/scripts/ops/prepare_internal_pki.sh" "$EPHEMERAL_PKI_DIR" >/dev/null 2>&1; then
    echo "Failed to generate ephemeral internal PKI" >&2
    return 1
  fi
  EPHEMERAL_PKI_VOLUME="gcs-saker-smoke-pki-$$-${RANDOM}"
  export EPHEMERAL_PKI_VOLUME
  docker volume create --label gcs-saker.ephemeral-pki=true "$EPHEMERAL_PKI_VOLUME" >/dev/null
  docker run --rm \
    -v "${EPHEMERAL_PKI_DIR}:/source:ro" \
    -v "${EPHEMERAL_PKI_VOLUME}:/target" \
    alpine:3.23 sh -eu -c '
      cp /source/ca.crt /source/auth-policy.crt /source/auth-policy.key \
        /source/media-control.crt /source/media-control.key \
        /source/mqtt.crt /source/mqtt.key /source/mqtt-health.crt /source/mqtt-health.key \
        /source/backend.crt /source/backend.key /target/
      chown 10002:10002 /target/auth-policy.key
      chown 10001:10001 /target/media-control.key /target/backend.key
      chown 1883:1883 /target/mqtt.key /target/mqtt-health.key
      chmod 600 /target/*.key
      chmod 644 /target/*.crt
    '
  if command -v cygpath >/dev/null 2>&1; then
    export INTERNAL_PKI_DIR="$(cygpath -m "$EPHEMERAL_PKI_DIR")"
  else
    export INTERNAL_PKI_DIR="$EPHEMERAL_PKI_DIR"
  fi
  export AUTH_POLICY_AUDIT_ANCHOR_ENABLED=false
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
  return "$status"
}
