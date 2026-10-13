#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
encrypted_bundle="${1:?Usage: materialize_sops_secrets.sh <encrypted-bundle> <output-directory>}"
output_directory="${2:?Usage: materialize_sops_secrets.sh <encrypted-bundle> <output-directory>}"
[[ "${DEPLOYMENT_TARGET:-}" == "server01-production" ]] || { echo "only Server-01 is managed" >&2; exit 2; }
[[ "${encrypted_bundle}" = /* && -f "${encrypted_bundle}" ]] || { echo "encrypted bundle must be an existing absolute file" >&2; exit 2; }
[[ "${output_directory}" = /* && -d "${output_directory}" ]] || { echo "output directory must be absolute" >&2; exit 2; }
[[ -n "${SOPS_AGE_KEY_FILE:-}" && -f "${SOPS_AGE_KEY_FILE}" ]] || { echo "SOPS age key credential is missing" >&2; exit 2; }
command -v sops >/dev/null || { echo "sops is required" >&2; exit 127; }

sops --decrypt --output-type json "${encrypted_bundle}" \
  | python3 "${ROOT}/scripts/ops/materialize_secret_bundle.py" \
      --allowlist "${ROOT}/deploy/runtime-credentials/server01-required-secret-names.txt" \
      --optional-allowlist "${ROOT}/deploy/runtime-credentials/server01-optional-secret-names.txt" \
      --runtime-gid "${GCS_SECRET_RUNTIME_GID:-10050}" \
      --output-directory "${output_directory}"
