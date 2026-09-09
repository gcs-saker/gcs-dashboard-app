#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
manifest="${RELEASE_MANIFEST:?Set RELEASE_MANIFEST to the signed release manifest}"
bundle="${RELEASE_MANIFEST_BUNDLE:?Set RELEASE_MANIFEST_BUNDLE to its Cosign bundle}"
expected_commit="${SOURCE_COMMIT:?Set SOURCE_COMMIT to the immutable checkout revision}"
identity='^https://github.com/gcs-saker/gcs-dashboard-app/.github/workflows/release-supply-chain.yml@refs/(tags|heads)/'
issuer='https://token.actions.githubusercontent.com'

command -v cosign >/dev/null || { echo "cosign is required" >&2; exit 127; }
[[ -f "${manifest}" && -f "${bundle}" ]] || { echo "signed release manifest evidence is missing" >&2; exit 2; }

cosign verify-blob \
  --bundle "${bundle}" \
  --certificate-identity-regexp "${identity}" \
  --certificate-oidc-issuer "${issuer}" \
  "${manifest}" >/dev/null

inventory="$(python3 "${ROOT}/scripts/ops/release_manifest.py" verify \
  --manifest "${manifest}" --source-commit "${expected_commit}")"

export BACKEND_IMAGE="$(jq -r '.backend' <<<"${inventory}")"
export AUTH_POLICY_IMAGE="$(jq -r '."auth-policy"' <<<"${inventory}")"
export MEDIA_CONTROL_IMAGE="$(jq -r '."media-control"' <<<"${inventory}")"
export DASHBOARD_IMAGE="$(jq -r '.dashboard' <<<"${inventory}")"

for image in "${BACKEND_IMAGE}" "${AUTH_POLICY_IMAGE}" "${MEDIA_CONTROL_IMAGE}" "${DASHBOARD_IMAGE}"; do
  cosign verify --certificate-identity-regexp "${identity}" --certificate-oidc-issuer "${issuer}" "${image}" >/dev/null
  cosign verify-attestation --type slsaprovenance \
    --certificate-identity-regexp "${identity}" --certificate-oidc-issuer "${issuer}" "${image}" >/dev/null
  cosign verify-attestation --type spdxjson \
    --certificate-identity-regexp "${identity}" --certificate-oidc-issuer "${issuer}" "${image}" >/dev/null
done

printf 'BACKEND_IMAGE=%s\n' "${BACKEND_IMAGE}"
printf 'AUTH_POLICY_IMAGE=%s\n' "${AUTH_POLICY_IMAGE}"
printf 'MEDIA_CONTROL_IMAGE=%s\n' "${MEDIA_CONTROL_IMAGE}"
printf 'DASHBOARD_IMAGE=%s\n' "${DASHBOARD_IMAGE}"
