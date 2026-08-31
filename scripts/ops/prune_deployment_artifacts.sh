#!/usr/bin/env bash
set -euo pipefail

deployment_target="${DEPLOYMENT_TARGET:?Set DEPLOYMENT_TARGET=server01-production}"
project_name="${COMPOSE_PROJECT_NAME:-gcs-saker-m2-production}"
builder_retention="${BUILDER_CACHE_RETENTION:-24h}"
image_retention="${DEPLOYED_IMAGE_RETENTION:-168h}"

[[ "${deployment_target}" == "server01-production" ]] || {
  echo "unsupported deployment target: ${deployment_target}" >&2
  exit 2
}
[[ "${project_name}" == "gcs-saker-m2-production" ]] || {
  echo "unexpected Compose project: ${project_name}" >&2
  exit 2
}
[[ "${builder_retention}" =~ ^[1-9][0-9]*h$ ]] || {
  echo "BUILDER_CACHE_RETENTION must use positive Docker hours, for example 24h" >&2
  exit 2
}
[[ "${image_retention}" =~ ^[1-9][0-9]*h$ ]] || {
  echo "DEPLOYED_IMAGE_RETENTION must use positive Docker hours, for example 168h" >&2
  exit 2
}

# Docker never removes artifacts referenced by a running container. Age gates
# retain recent layers for rollback while bounding accumulation across releases.
docker builder prune --force --filter "until=${builder_retention}"
docker image prune --all --force --filter "until=${image_retention}"
