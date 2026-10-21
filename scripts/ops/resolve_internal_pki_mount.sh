#!/usr/bin/env bash
set -euo pipefail

container="${1:?Usage: resolve_internal_pki_mount.sh <mqtt-container>}"
docker_bin="${DOCKER_BIN:-docker}"

directory_source="$("${docker_bin}" inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/run/secrets/gcs-pki"}}{{.Source}}{{end}}{{end}}' \
  "${container}")"
if [[ "${directory_source}" = /* && -d "${directory_source}" && -s "${directory_source}/ca.crl" ]]; then
  printf '%s\n' "${directory_source}"
  exit 0
fi

file_source="$("${docker_bin}" inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/run/secrets/gcs-pki/ca.crl"}}{{.Source}}{{end}}{{end}}' \
  "${container}")"
if [[ "${file_source}" = /* && -f "${file_source}" ]]; then
  dirname "${file_source}"
  exit 0
fi

echo "MQTT CRL source is unavailable" >&2
exit 1
