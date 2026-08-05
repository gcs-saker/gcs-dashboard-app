#!/usr/bin/env bash
set -euo pipefail

project_name="${COMPOSE_PROJECT_NAME:-gcs-saker-m2-production}"
public_origin="${PUBLIC_ORIGIN:-https://a4ai.121-159-26-245.sslip.io}"
compose_file="${COMPOSE_FILE:?Set COMPOSE_FILE to the active absolute Compose file}"
env_file="${ENV_FILE:?Set ENV_FILE to the Server-01 private environment file}"
expected_commit="${EXPECTED_COMMIT:?Set EXPECTED_COMMIT to the deployed source commit}"

[[ "${project_name}" == "gcs-saker-m2-production" ]] || { echo "unexpected project" >&2; exit 2; }
[[ "${public_origin}" == "https://a4ai.121-159-26-245.sslip.io" ]] || { echo "unexpected public origin" >&2; exit 2; }
[[ "${compose_file}" = /* && -f "${compose_file}" && "${env_file}" = /* && -f "${env_file}" ]] || {
  echo "Compose and environment files must be existing absolute paths" >&2
  exit 2
}

compose=(docker compose --project-name "${project_name}" --env-file "${env_file}" -f "${compose_file}")
application_services=(backend auth-policy media-control dashboard)
required_services=(postgres-geo redis mqtt mediamtx turn-primary turn-secondary mobile-publisher edge)

curl --fail --silent --show-error --max-time 15 "${public_origin}/healthz" >/dev/null
curl --fail --silent --show-error --max-time 15 "${public_origin}/readyz" >/dev/null
[[ "$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 15 "${public_origin}/media-control/api/v1/streams")" == "401" ]]
[[ "$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 15 "${public_origin}/swagger")" == "404" ]]

for service in "${application_services[@]}"; do
  container_id="$("${compose[@]}" ps -q "${service}")"
  [[ -n "${container_id}" ]] || { echo "missing service: ${service}" >&2; exit 1; }
  revision="$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "${container_id}")"
  health="$(docker inspect --format '{{ if .State.Health }}{{ .State.Health.Status }}{{ else }}running{{ end }}' "${container_id}")"
  [[ "${revision}" == "${expected_commit}" && "${health}" == "healthy" ]] || {
    echo "application verification failed: ${service}" >&2
    exit 1
  }
done

for service in "${required_services[@]}"; do
  container_id="$("${compose[@]}" ps -q "${service}")"
  [[ -n "${container_id}" ]] || { echo "missing service: ${service}" >&2; exit 1; }
  running="$(docker inspect --format '{{ .State.Running }}' "${container_id}")"
  [[ "${running}" == "true" ]] || { echo "service is not running: ${service}" >&2; exit 1; }
done

echo "Server-01 operational smoke passed for ${expected_commit}"
