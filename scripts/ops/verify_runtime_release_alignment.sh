#!/usr/bin/env bash
set -euo pipefail

compose_file="${COMPOSE_FILE:?Set COMPOSE_FILE to the release Compose file}"
env_file="${ENV_FILE:?Set ENV_FILE to the private deployment environment file}"
project_name="${COMPOSE_PROJECT_NAME:?Set COMPOSE_PROJECT_NAME}"
source_commit="${SOURCE_COMMIT:?Set SOURCE_COMMIT}"
scope="${1:-all}"

[[ "${compose_file}" = /* && -f "${compose_file}" ]] || { echo "COMPOSE_FILE must be an existing absolute file" >&2; exit 2; }
[[ "${env_file}" = /* && -f "${env_file}" ]] || { echo "ENV_FILE must be an existing absolute file" >&2; exit 2; }
[[ "${project_name}" == "gcs-saker-m2-production" ]] || { echo "invalid production project name" >&2; exit 2; }
[[ "${source_commit}" =~ ^[0-9a-f]{40}$ ]] || { echo "SOURCE_COMMIT must be a full Git commit" >&2; exit 2; }

stateless_services=(backend auth-policy media-control dashboard)
infrastructure_services=(mqtt mediamtx turn-primary)
case "${scope}" in
  infrastructure) services=("${infrastructure_services[@]}") ;;
  all) services=("${stateless_services[@]}" "${infrastructure_services[@]}") ;;
  *) echo "scope must be infrastructure or all" >&2; exit 2 ;;
esac

expected_image() {
  case "$1" in
    backend) printf '%s' "${BACKEND_IMAGE:?Set BACKEND_IMAGE}" ;;
    auth-policy) printf '%s' "${AUTH_POLICY_IMAGE:?Set AUTH_POLICY_IMAGE}" ;;
    media-control) printf '%s' "${MEDIA_CONTROL_IMAGE:?Set MEDIA_CONTROL_IMAGE}" ;;
    dashboard) printf '%s' "${DASHBOARD_IMAGE:?Set DASHBOARD_IMAGE}" ;;
    mqtt) printf '%s' "${MQTT_IMAGE:?Set MQTT_IMAGE}" ;;
    mediamtx) printf '%s' "${MEDIAMTX_IMAGE:?Set MEDIAMTX_IMAGE}" ;;
    turn-primary) printf '%s' "${COTURN_IMAGE:?Set COTURN_IMAGE}" ;;
  esac
}

compose=(docker compose --project-name "${project_name}" --env-file "${env_file}" -f "${compose_file}")
for service in "${services[@]}"; do
  container="$("${compose[@]}" ps -q "${service}")"
  [[ -n "${container}" ]] || { echo "release alignment failed: ${service} is absent" >&2; exit 1; }
  revision="$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${container}")"
  [[ "${revision}" == "${source_commit}" ]] || { echo "release alignment failed: ${service} revision mismatch" >&2; exit 1; }
  expected="$(expected_image "${service}")"
  expected_id="$(docker image inspect --format '{{.Id}}' "${expected}")"
  actual_id="$(docker inspect --format '{{.Image}}' "${container}")"
  [[ "${actual_id}" == "${expected_id}" ]] || { echo "release alignment failed: ${service} image mismatch" >&2; exit 1; }
done

echo "runtime release alignment passed: scope=${scope} source=${source_commit}"
