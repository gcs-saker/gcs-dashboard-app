#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT}/deploy/compose/compose.single-node.poc.yml"
ENV_FILE="${ENV_FILE:?Set ENV_FILE to the private deployment environment file}"
MQTT_PASSWORD_FILE="${MQTT_PASSWORD_FILE:?Set MQTT_PASSWORD_FILE to the private Mosquitto password file}"
RELEASE_DIR="${RELEASE_DIR:?Set RELEASE_DIR to an existing release evidence directory}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-gcs-saker}"
export SOURCE_COMMIT="$(git -C "${ROOT}" rev-parse HEAD)"
export BACKEND_IMAGE="gcs-saker-backend:${SOURCE_COMMIT}"
export AUTH_POLICY_IMAGE="gcs-saker-auth-policy:${SOURCE_COMMIT}"
export MEDIA_CONTROL_IMAGE="gcs-saker-media-control:${SOURCE_COMMIT}"
export DASHBOARD_IMAGE="gcs-saker-dashboard:${SOURCE_COMMIT}"
STATELESS_SERVICES=(backend auth-policy media-control dashboard edge)
# Only services with a Compose build definition belong here. The publisher and
# edge images are supplied by the deployment environment; passing them to
# `compose build` makes Compose attempt an unauthenticated registry pull.
BUILD_SERVICES=(backend auth-policy media-control dashboard)
# The publisher is an externally supplied local image. It is verified but not
# recreated by this source release, because there is no reproducible build
# definition or registry artifact for it in this repository.
UNCHANGED_SERVICES=(mobile-publisher postgres-geo redis mqtt mediamtx turn-primary turn-secondary)

[[ "${RELEASE_DIR}" = /* && -d "${RELEASE_DIR}" ]] || { echo "RELEASE_DIR must be an existing absolute directory" >&2; exit 2; }
compose=(docker compose --project-name "${PROJECT_NAME}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")
flyway_file="${RELEASE_DIR}/applied-flyway.tsv"
if [[ -n "${PUBLIC_TLS_HOST:-}" ]]; then
  # Fail before changing any application container. A broken or self-signed
  # public edge cannot safely carry credentials, gRPC metadata, or media tokens.
  "${ROOT}/scripts/ops/check_public_tls.sh" "${PUBLIC_TLS_HOST}" "${PUBLIC_TLS_PORT:-443}"
fi
"${compose[@]}" exec -T postgres-geo sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --tuples-only --no-align --field-separator="|" --command="select version,checksum from flyway_schema_history where success and type='\''SQL'\'' order by installed_rank"' \
  > "${flyway_file}"
python3 "${ROOT}/scripts/ops/release_gate.py" \
  --env-file "${ENV_FILE}" \
  --mqtt-password-file "${MQTT_PASSWORD_FILE}" \
  --applied-flyway-tsv "${flyway_file}" \
  --output "${RELEASE_DIR}/release-manifest.json"

previous_file="${RELEASE_DIR}/previous-images.env"
: > "${previous_file}"
for service in "${STATELESS_SERVICES[@]}"; do
  container_id="$("${compose[@]}" ps -q "${service}")"
  if [[ -n "${container_id}" ]]; then
    image_id="$(docker inspect --format '{{.Image}}' "${container_id}")"
    printf '%s=%s\n' "${service}" "${image_id}" >> "${previous_file}"
  fi
done

rollback() {
  echo "stateless deployment failed; restoring captured images" >&2
  while IFS='=' read -r service image_id; do
    [[ -n "${service}" && -n "${image_id}" ]] || continue
    docker tag "${image_id}" "gcs-saker-rollback:${service}"
  done < "${previous_file}"
  BACKEND_IMAGE=gcs-saker-rollback:backend \
  AUTH_POLICY_IMAGE=gcs-saker-rollback:auth-policy \
  MEDIA_CONTROL_IMAGE=gcs-saker-rollback:media-control \
  DASHBOARD_IMAGE=gcs-saker-rollback:dashboard \
  MOBILE_PUBLISHER_IMAGE=gcs-saker-rollback:mobile-publisher \
    "${compose[@]}" up -d --no-deps "${STATELESS_SERVICES[@]}"
}
trap rollback ERR

"${compose[@]}" build "${BUILD_SERVICES[@]}"
"${compose[@]}" images --format json > "${RELEASE_DIR}/deployment-images.json"
"${compose[@]}" up -d --no-deps "${STATELESS_SERVICES[@]}"
for service in "${BUILD_SERVICES[@]}"; do
  container_id="$("${compose[@]}" ps -q "${service}")"
  actual_revision="$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${container_id}")"
  [[ "${actual_revision}" == "${SOURCE_COMMIT}" ]] || {
    echo "release provenance mismatch: ${service}=${actual_revision}, expected=${SOURCE_COMMIT}" >&2
    exit 1
  }
done
for service in "${UNCHANGED_SERVICES[@]}"; do
  "${compose[@]}" ps "${service}" >/dev/null
done
"${compose[@]}" exec -T edge nginx -t
# Verify through the deployed edge without assuming which host port each
# environment publishes. Public TLS is terminated by the host reverse proxy;
# this container-internal check validates the complete application route.
"${compose[@]}" exec -T edge \
  wget --timeout=10 --tries=1 -q -O- \
  "${HEALTH_URL:-http://127.0.0.1:8080/readyz}" >/dev/null
if [[ -n "${PUBLIC_TLS_HOST:-}" ]]; then
  "${ROOT}/scripts/ops/check_public_tls.sh" "${PUBLIC_TLS_HOST}" "${PUBLIC_TLS_PORT:-443}"
fi
trap - ERR
echo "stateless deployment completed; stateful and external-image services were not recreated"
