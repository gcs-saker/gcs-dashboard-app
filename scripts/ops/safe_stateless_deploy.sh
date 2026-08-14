#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT}/deploy/compose/compose.single-node.poc.yml"
ENV_FILE="${ENV_FILE:?Set ENV_FILE to the private deployment environment file}"
MQTT_PASSWORD_FILE="${MQTT_PASSWORD_FILE:?Set MQTT_PASSWORD_FILE to the private Mosquitto password file}"
RELEASE_DIR="${RELEASE_DIR:?Set RELEASE_DIR to an existing release evidence directory}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-gcs-saker}"
DEPLOYMENT_TARGET="${DEPLOYMENT_TARGET:?Set DEPLOYMENT_TARGET=server01-production}"
[[ "${DEPLOYMENT_TARGET}" == "server01-production" ]] || {
  echo "unsupported deployment target: ${DEPLOYMENT_TARGET}; only server01-production is managed" >&2
  exit 2
}
[[ "${PROJECT_NAME}" == "gcs-saker-m2-production" ]] || {
  echo "COMPOSE_PROJECT_NAME must be gcs-saker-m2-production" >&2
  exit 2
}
export SOURCE_COMMIT="$(git -C "${ROOT}" rev-parse HEAD)"
export BACKEND_IMAGE="gcs-saker-backend:${SOURCE_COMMIT}"
export AUTH_POLICY_IMAGE="gcs-saker-auth-policy:${SOURCE_COMMIT}"
export MEDIA_CONTROL_IMAGE="gcs-saker-media-control:${SOURCE_COMMIT}"
export DASHBOARD_IMAGE="gcs-saker-dashboard:${SOURCE_COMMIT}"
STATELESS_SERVICES=(backend auth-policy media-control dashboard)
# Only services with a Compose build definition belong here. The publisher and
# edge images are supplied by the deployment environment; passing them to
# `compose build` makes Compose attempt an unauthenticated registry pull.
BUILD_SERVICES=(backend auth-policy media-control dashboard)
# The publisher is an externally supplied local image. It is verified but not
# recreated by this source release, because there is no reproducible build
# definition or registry artifact for it in this repository.
# The public edge must stay available while application containers are
# replaced. Recreating it makes the host Caddy upstream (127.0.0.1:80)
# disappear and turns every concurrent request into a 502. Edge configuration
# changes use a separate, explicitly planned ingress rollout.
UNCHANGED_SERVICES=(edge mobile-publisher postgres-geo redis mqtt mediamtx turn-primary)

[[ "${RELEASE_DIR}" = /* && -d "${RELEASE_DIR}" ]] || { echo "RELEASE_DIR must be an existing absolute directory" >&2; exit 2; }
root_real="$(realpath "${ROOT}")"
release_dir_real="$(realpath "${RELEASE_DIR}")"
case "${release_dir_real}" in
  "${root_real}"|"${root_real}"/*)
    echo "RELEASE_DIR must be outside the immutable source checkout" >&2
    exit 2
    ;;
esac
compose=(docker compose --project-name "${PROJECT_NAME}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")
previous_container_id="$("${compose[@]}" ps -q backend)"
[[ -n "${previous_container_id}" ]] || { echo "running backend container is required" >&2; exit 2; }
previous_compose_file="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "${previous_container_id}")"
[[ "${previous_compose_file}" = /* && -f "${previous_compose_file}" ]] || {
  echo "previous Compose file is not an existing absolute path: ${previous_compose_file}" >&2
  exit 2
}
previous_compose=(docker compose --project-name "${PROJECT_NAME}" --env-file "${ENV_FILE}" -f "${previous_compose_file}")
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
stateful_file="${RELEASE_DIR}/stateful-containers.before.env"
: > "${previous_file}"
: > "${stateful_file}"
for service in "${STATELESS_SERVICES[@]}"; do
  container_id="$("${compose[@]}" ps -q "${service}")"
  if [[ -n "${container_id}" ]]; then
    image_id="$(docker inspect --format '{{.Image}}' "${container_id}")"
    printf '%s=%s\n' "${service}" "${image_id}" >> "${previous_file}"
  fi
done
for service in "${UNCHANGED_SERVICES[@]}"; do
  container_id="$("${previous_compose[@]}" ps -q "${service}")"
  [[ -n "${container_id}" ]] || { echo "required unchanged service is absent: ${service}" >&2; exit 2; }
  printf '%s=%s\n' "${service}" "${container_id}" >> "${stateful_file}"
done

rollback() {
  original_status=$?
  trap - ERR
  set +e
  echo "stateless deployment failed; restoring captured images with ${previous_compose_file}" >&2
  while IFS='=' read -r service image_id; do
    [[ -n "${service}" && -n "${image_id}" ]] || continue
    docker tag "${image_id}" "gcs-saker-rollback:${service}"
  done < "${previous_file}"
  BACKEND_IMAGE=gcs-saker-rollback:backend \
  AUTH_POLICY_IMAGE=gcs-saker-rollback:auth-policy \
  MEDIA_CONTROL_IMAGE=gcs-saker-rollback:media-control \
  DASHBOARD_IMAGE=gcs-saker-rollback:dashboard \
    "${previous_compose[@]}" up -d --no-deps "${STATELESS_SERVICES[@]}"
  rollback_status=$?
  if (( rollback_status != 0 )); then
    echo "rollback failed; use previous Compose file: ${previous_compose_file}" >&2
  fi
  exit "${original_status}"
}

"${compose[@]}" build "${BUILD_SERVICES[@]}"
"${compose[@]}" images --format json > "${RELEASE_DIR}/deployment-images.json"
trap rollback ERR
"${compose[@]}" up -d --no-deps "${STATELESS_SERVICES[@]}"
for service in "${BUILD_SERVICES[@]}"; do
  container_id="$("${compose[@]}" ps -q "${service}")"
  actual_revision="$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${container_id}")"
  [[ "${actual_revision}" == "${SOURCE_COMMIT}" ]] || {
    echo "release provenance mismatch: ${service}=${actual_revision}, expected=${SOURCE_COMMIT}" >&2
    exit 1
  }
done
while IFS='=' read -r service previous_id; do
  current_id="$("${compose[@]}" ps -q "${service}")"
  [[ "${current_id}" == "${previous_id}" ]] || {
    echo "stateful/external service was replaced: ${service}" >&2
    exit 1
  }
done < "${stateful_file}"
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
# Keep the operator-facing release pointer aligned with the Compose source that
# now owns the live containers. Updating it only after every verification has
# passed preserves the previous pointer when rollback runs.
runtime_root="$(dirname "$(dirname "${ROOT}")")"
[[ "$(basename "$(dirname "${ROOT}")")" == "releases" ]] || {
  echo "immutable source checkout must be located under <runtime>/releases" >&2
  exit 2
}
ln -sfn "${ROOT}" "${runtime_root}/current"
[[ "$(realpath "${runtime_root}/current")" == "${ROOT}" ]] || {
  echo "failed to update active release pointer" >&2
  exit 1
}
trap - ERR
if [[ "${DOCKER_RETENTION_ENABLED:-1}" == "1" ]]; then
  bash "${ROOT}/scripts/ops/prune_deployment_artifacts.sh"
fi
echo "stateless deployment completed; stateful and external-image services were not recreated"
