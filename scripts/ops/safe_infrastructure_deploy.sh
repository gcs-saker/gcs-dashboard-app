#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT}/deploy/compose/compose.single-node.poc.yml"
ENV_FILE="${ENV_FILE:?Set ENV_FILE to the private deployment environment file}"
MQTT_PASSWORD_FILE="${MQTT_PASSWORD_FILE:?Set MQTT_PASSWORD_FILE to the private Mosquitto password file}"
RELEASE_DIR="${RELEASE_DIR:?Set RELEASE_DIR to an existing release evidence directory}"
DEPLOYMENT_TARGET="${DEPLOYMENT_TARGET:?Set DEPLOYMENT_TARGET=server01-production}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-gcs-saker-m2-production}"
SOURCE_COMMIT="$(git -C "${ROOT}" rev-parse HEAD)"
SERVICES=(mqtt mediamtx turn-primary)

[[ "${DEPLOYMENT_TARGET}" == "server01-production" ]] || { echo "only Server-01 production is managed" >&2; exit 2; }
[[ "${PROJECT_NAME}" == "gcs-saker-m2-production" ]] || { echo "invalid production project name" >&2; exit 2; }
[[ "${RELEASE_DIR}" = /* && -d "${RELEASE_DIR}" ]] || { echo "RELEASE_DIR must be an existing absolute directory" >&2; exit 2; }

verified_images="${RELEASE_DIR}/verified-images.env"
RELEASE_MANIFEST="${RELEASE_MANIFEST:-${RELEASE_DIR}/release-manifest.json}" \
RELEASE_MANIFEST_BUNDLE="${RELEASE_MANIFEST_BUNDLE:-${RELEASE_DIR}/release-manifest.cosign.bundle.json}" \
  SOURCE_COMMIT="${SOURCE_COMMIT}" bash "${ROOT}/scripts/ops/verify_signed_release.sh" > "${verified_images}"
# shellcheck disable=SC1090
source "${verified_images}"
export MQTT_IMAGE MEDIAMTX_IMAGE COTURN_IMAGE
compose=(docker compose --project-name "${PROJECT_NAME}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}")

declare -A previous_ids previous_images rollback_tags
deployment_complete=0
active_service=""

container_id() {
  "${compose[@]}" ps -q "$1"
}

capture_previous_state() {
  local service container
  : > "${RELEASE_DIR}/infrastructure-containers.before.env"
  for service in "${SERVICES[@]}"; do
    container="$(container_id "${service}")"
    [[ -n "${container}" ]] || { echo "required service is absent: ${service}" >&2; return 1; }
    previous_ids["${service}"]="${container}"
    previous_images["${service}"]="$(docker inspect --format '{{.Image}}' "${container}")"
    rollback_tags["${service}"]="gcs-saker-infra-rollback:${service}"
    printf '%s=%s\n' "${service}" "${container}" >> "${RELEASE_DIR}/infrastructure-containers.before.env"
  done
}

backup_mqtt_data() {
  local container archive container_archive digest
  container="${previous_ids[mqtt]}"
  archive="${RELEASE_DIR}/mqtt-data.before.tar.gz"
  container_archive="/tmp/gcs-mqtt-data.before.tar.gz"
  docker exec -u 0 "${container}" tar -C /mosquitto/data -czf "${container_archive}" .
  docker cp "${container}:${container_archive}" "${archive}"
  docker exec -u 0 "${container}" rm -f "${container_archive}"
  tar -tzf "${archive}" >/dev/null
  digest="$(sha256sum "${archive}" | cut -d' ' -f1)"
  printf 'mqttBackup=%s\nsha256=%s\nsourceCommit=%s\n' "${archive}" "${digest}" "${SOURCE_COMMIT}" \
    > "${RELEASE_DIR}/infrastructure-backup.evidence"
}

require_idle_media_plane() {
  local edge active_paths
  edge="$(container_id edge)"
  [[ -n "${edge}" ]] || { echo "edge container is required for private MediaMTX inspection" >&2; return 1; }
  active_paths="$(docker exec "${edge}" wget -q -O- http://mediamtx:9997/v3/paths/list \
    | python3 -c 'import json,sys; print(sum(bool(item.get("ready")) for item in json.load(sys.stdin).get("items", [])))')"
  if [[ "${active_paths}" != "0" && "${ALLOW_MEDIA_SESSION_INTERRUPTION:-0}" != "1" ]]; then
    echo "active MediaMTX paths=${active_paths}; set ALLOW_MEDIA_SESSION_INTERRUPTION=1 only in an approved window" >&2
    return 1
  fi
}

pull_and_verify_images() {
  local image
  for image in "${MQTT_IMAGE}" "${MEDIAMTX_IMAGE}" "${COTURN_IMAGE}"; do
    docker pull "${image}"
  done
}

wait_container() {
  local service="$1" expected="$2" container status
  for _ in $(seq 1 60); do
    container="$(container_id "${service}")"
    if [[ -n "${container}" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container}")"
      [[ "${status}" == "${expected}" ]] && return 0
      [[ "${status}" == "unhealthy" || "${status}" == "exited" ]] && break
    fi
    sleep 2
  done
  echo "service failed readiness: ${service}" >&2
  return 1
}

verify_deployed_revision() {
  local service="$1" container revision
  container="$(container_id "${service}")"
  revision="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "${container}")"
  [[ "${revision}" == "${SOURCE_COMMIT}" ]] || {
    echo "release provenance mismatch: ${service}=${revision}, expected=${SOURCE_COMMIT}" >&2
    return 1
  }
}

replace_service() {
  local service="$1" expected="$2"
  active_service="${service}"
  "${compose[@]}" up -d --no-deps "${service}"
  wait_container "${service}" "${expected}"
  verify_deployed_revision "${service}"
}

check_mqtt() {
  local container
  container="$(container_id mqtt)"
  [[ "$(docker inspect --format '{{.State.Health.Status}}' "${container}")" == "healthy" ]]
}

check_mediamtx() {
  local edge
  edge="$(container_id edge)"
  docker exec "${edge}" wget --timeout=5 --tries=1 -q -O- http://mediamtx:9997/v3/config/global/get >/dev/null
  "${compose[@]}" exec -T media-control /usr/local/bin/media-control healthcheck
}

check_turn() {
  local container
  container="$(container_id turn-primary)"
  docker exec "${container}" turnutils_stunclient 127.0.0.1 >/dev/null
}

rollback_service() {
  local service="$1" image_variable
  [[ -n "${previous_images[${service}]:-}" ]] || return 0
  docker tag "${previous_images[${service}]}" "${rollback_tags[${service}]}"
  case "${service}" in
    mqtt) image_variable=MQTT_IMAGE ;;
    mediamtx) image_variable=MEDIAMTX_IMAGE ;;
    turn-primary) image_variable=COTURN_IMAGE ;;
  esac
  env "${image_variable}=${rollback_tags[${service}]}" "${compose[@]}" up -d --no-deps "${service}"
}

on_exit() {
  local status=$?
  (( deployment_complete == 1 || status == 0 )) && return
  trap - EXIT
  if [[ -n "${active_service}" ]]; then
    echo "rolling back failed infrastructure service: ${active_service}" >&2
    rollback_service "${active_service}" || echo "automatic rollback failed: ${active_service}" >&2
  fi
  exit "${status}"
}

capture_previous_state
backup_mqtt_data
require_idle_media_plane
pull_and_verify_images
trap on_exit EXIT

replace_service mqtt healthy
check_mqtt
active_service=""
replace_service mediamtx running
check_mediamtx
active_service=""
replace_service turn-primary healthy
check_turn
active_service=""

for service in "${SERVICES[@]}"; do
  current="$(container_id "${service}")"
  [[ "${current}" != "${previous_ids[${service}]}" ]] || { echo "service was not replaced: ${service}" >&2; exit 1; }
done

deployment_complete=1
trap - EXIT
echo "infrastructure deployment completed sequentially: mqtt -> mediamtx -> turn-primary"
