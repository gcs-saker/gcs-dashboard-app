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
canonical_edge_config="${RELEASE_DIR}/edge-nginx.before.conf"
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

short_commit="${SOURCE_COMMIT:0:12}"
green_auth="gcs-green-${short_commit}-auth"
green_media="gcs-green-${short_commit}-media"
green_backend="gcs-green-${short_commit}-backend"
green_dashboard="gcs-green-${short_commit}-dashboard"
green_containers=("${green_auth}" "${green_media}" "${green_backend}" "${green_dashboard}")
edge_container="$(${previous_compose[@]} ps -q edge)"
docker cp "${edge_container}:/etc/nginx/nginx.conf" "${canonical_edge_config}"
edge_uses_green=0
official_replace_started=0
deployment_complete=0
probe_pid=""
probe_stop_file="${RELEASE_DIR}/availability-probe.stop"
probe_output="${RELEASE_DIR}/availability-probe.tsv"

wait_container_healthy() {
  local container="$1" status=""
  for _ in $(seq 1 60); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container}")"
    [[ "${status}" == "healthy" ]] && return 0
    [[ "${status}" == "unhealthy" || "${status}" == "exited" ]] && return 1
    sleep 2
  done
  echo "container did not become healthy: ${container} (${status})" >&2
  return 1
}

wait_official_services() {
  local service container
  for service in "${STATELESS_SERVICES[@]}"; do
    container="$(${compose[@]} ps -q "${service}")"
    [[ -n "${container}" ]] && wait_container_healthy "${container}" || return 1
  done
  local auth_container="$(${compose[@]} ps -q auth-policy)"
  for _ in $(seq 1 30); do
    docker exec "${auth_container}" wget -q -O- http://127.0.0.1:8080/readyz >/dev/null && return 0
    sleep 1
  done
  echo "official auth-policy did not become ready" >&2
  return 1
}

remove_green_containers() {
  local container
  for container in "${green_containers[@]}"; do
    docker rm -f "${container}" >/dev/null 2>&1 || true
  done
}

render_green_edge_config() {
  local output="$1"
  sed \
    -e 's/set \$dashboard_host dashboard;/set \$dashboard_host '"${green_dashboard}"';/' \
    -e 's/set \$backend_host backend;/set \$backend_host '"${green_backend}"';/' \
    -e 's/set \$auth_policy_host auth-policy;/set \$auth_policy_host '"${green_auth}"';/' \
    -e 's/set \$media_control_host media-control;/set \$media_control_host '"${green_media}"';/' \
    -e "s/server media-control:9090;/server ${green_media}:9090;/" \
    "${canonical_edge_config}" > "${output}"
}

reload_edge_config() {
  local config="$1" target="/tmp/$(basename "$1")"
  local master old_workers
  master="$(docker exec "${edge_container}" sh -c 'cat /tmp/nginx.pid')"
  old_workers="$(docker exec "${edge_container}" sh -c "cat /proc/${master}/task/${master}/children")"
  docker exec -i "${edge_container}" sh -c "umask 077; tee '${target}' >/dev/null" < "${config}"
  docker exec "${edge_container}" nginx -t -c "${target}"
  docker exec "${edge_container}" nginx -s reload -c "${target}"
  wait_edge_workers_drained "${old_workers}"
}

wait_edge_workers_drained() {
  local workers="$1" worker active
  for _ in $(seq 1 150); do
    active=0
    for worker in ${workers}; do
      docker exec "${edge_container}" sh -c "test ! -d /proc/${worker}" || active=1
    done
    (( active == 0 )) && return 0
    sleep 0.2
  done
  echo "previous edge workers did not drain" >&2
  return 1
}

start_availability_probe() {
  [[ -n "${PUBLIC_TLS_HOST:-}" ]] || return 0
  rm -f "${probe_stop_file}"
  : > "${probe_output}"
  (
    while [[ ! -e "${probe_stop_file}" ]]; do
      health="$(curl -ksS --max-time 2 -o /dev/null -w '%{http_code}' "https://${PUBLIC_TLS_HOST}:${PUBLIC_TLS_PORT:-443}/healthz" || true)"
      ready="$(curl -ksS --max-time 2 -o /dev/null -w '%{http_code}' "https://${PUBLIC_TLS_HOST}:${PUBLIC_TLS_PORT:-443}/readyz" || true)"
      printf '%s\t%s\t%s\n' "$(date -u +%FT%T.%3NZ)" "${health}" "${ready}" >> "${probe_output}"
      sleep 0.2
    done
  ) &
  probe_pid="$!"
}

stop_availability_probe() {
  [[ -n "${probe_pid}" ]] || return 0
  : > "${probe_stop_file}"
  wait "${probe_pid}" || true
  probe_pid=""
}

assert_availability_probe() {
  [[ -s "${probe_output}" ]] || return 0
  awk -F '\t' '$2 != "200" || $3 != "200" { failed++ } END { exit failed > 0 }' "${probe_output}"
}

start_green_containers() {
  "${compose[@]}" run -d --no-deps --name "${green_auth}" auth-policy >/dev/null
  "${compose[@]}" run -d --no-deps --name "${green_media}" \
    -e "AUTH_POLICY_BASE_URL=http://${green_auth}:8080" media-control >/dev/null
  "${compose[@]}" run -d --no-deps --name "${green_backend}" \
    -e "CONTROL_GRPC_TARGET=${green_media}:9090" backend >/dev/null
  "${compose[@]}" run -d --no-deps --name "${green_dashboard}" dashboard >/dev/null
  local container
  for container in "${green_containers[@]}"; do
    wait_container_healthy "${container}"
    [[ "$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${container}")" == "${SOURCE_COMMIT}" ]]
  done
}

rollback() {
  original_status="${1:-$?}"
  trap - ERR EXIT
  set +e
  stop_availability_probe
  rollback_status=0
  if (( official_replace_started == 1 && edge_uses_green == 1 )); then
    reload_edge_config "${green_edge_config}"
  fi
  if (( official_replace_started == 1 )); then
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
    wait_official_services
  fi
  if (( edge_uses_green == 1 )); then
    reload_edge_config "${canonical_edge_config}"
  fi
  remove_green_containers
  if (( rollback_status != 0 )); then
    echo "rollback failed; use previous Compose file: ${previous_compose_file}" >&2
  fi
  exit "${original_status}"
}

on_exit() {
  local status=$?
  (( deployment_complete == 1 )) && return
  rollback "${status}"
}

"${compose[@]}" build "${BUILD_SERVICES[@]}"
"${compose[@]}" images --format json > "${RELEASE_DIR}/deployment-images.json"
trap on_exit EXIT
start_availability_probe
start_green_containers
green_edge_config="${RELEASE_DIR}/edge-nginx.green.conf"
render_green_edge_config "${green_edge_config}"
reload_edge_config "${green_edge_config}"
edge_uses_green=1
"${compose[@]}" exec -T edge wget --timeout=10 --tries=1 -q -O- http://127.0.0.1:8080/readyz >/dev/null
assert_availability_probe
official_replace_started=1
"${compose[@]}" up -d --no-deps "${STATELESS_SERVICES[@]}"
wait_official_services
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
reload_edge_config "${canonical_edge_config}"
stop_availability_probe
assert_availability_probe
edge_uses_green=0
remove_green_containers
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
deployment_complete=1
trap - EXIT
if [[ "${DOCKER_RETENTION_ENABLED:-1}" == "1" ]]; then
  bash "${ROOT}/scripts/ops/prune_deployment_artifacts.sh"
fi
echo "stateless deployment completed; stateful and external-image services were not recreated"
