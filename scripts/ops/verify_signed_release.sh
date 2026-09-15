#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
manifest="${RELEASE_MANIFEST:?Set RELEASE_MANIFEST to the signed release manifest}"
bundle="${RELEASE_MANIFEST_BUNDLE:?Set RELEASE_MANIFEST_BUNDLE to its Cosign bundle}"
expected_commit="${SOURCE_COMMIT:?Set SOURCE_COMMIT to the immutable checkout revision}"
identity='^https://github.com/gcs-saker/gcs-dashboard-app/.github/workflows/release-supply-chain.yml@refs/(tags|heads)/'
mobile_identity='^https://github.com/gcs-saker/gcs-mobile-publisher/.github/workflows/signed-release.yml@refs/(tags|heads)/'
issuer='https://token.actions.githubusercontent.com'
slsa_predicate='https://slsa.dev/provenance/v1'
spdx_predicate='https://spdx.dev/Document/v2.3'

cosign_bin="${COSIGN_BIN:-}"
if [[ -z "${cosign_bin}" ]]; then
  cosign_bin="$(command -v cosign || true)"
fi
if [[ -z "${cosign_bin}" && -x "${HOME}/.local/bin/cosign" ]]; then
  cosign_bin="${HOME}/.local/bin/cosign"
fi
[[ -n "${cosign_bin}" && -x "${cosign_bin}" ]] || { echo "cosign is required" >&2; exit 127; }
[[ -f "${manifest}" && -f "${bundle}" ]] || { echo "signed release manifest evidence is missing" >&2; exit 2; }

"${cosign_bin}" verify-blob \
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
export MOBILE_PUBLISHER_IMAGE="$(jq -r '."mobile-publisher"' <<<"${inventory}")"

for image in "${BACKEND_IMAGE}" "${AUTH_POLICY_IMAGE}" "${MEDIA_CONTROL_IMAGE}" "${DASHBOARD_IMAGE}"; do
  "${cosign_bin}" verify --certificate-identity-regexp "${identity}" --certificate-oidc-issuer "${issuer}" "${image}" >/dev/null
  "${cosign_bin}" verify-attestation --type "${slsa_predicate}" \
    --certificate-identity-regexp "${identity}" --certificate-oidc-issuer "${issuer}" "${image}" >/dev/null
  "${cosign_bin}" verify-attestation --type "${spdx_predicate}" \
    --certificate-identity-regexp "${identity}" --certificate-oidc-issuer "${issuer}" "${image}" >/dev/null
done

"${cosign_bin}" verify --certificate-identity-regexp "${mobile_identity}" \
  --certificate-oidc-issuer "${issuer}" "${MOBILE_PUBLISHER_IMAGE}" >/dev/null
"${cosign_bin}" verify-attestation --type "${slsa_predicate}" \
  --certificate-identity-regexp "${mobile_identity}" --certificate-oidc-issuer "${issuer}" \
  "${MOBILE_PUBLISHER_IMAGE}" >/dev/null
"${cosign_bin}" verify-attestation --type "${spdx_predicate}" \
  --certificate-identity-regexp "${mobile_identity}" --certificate-oidc-issuer "${issuer}" \
  "${MOBILE_PUBLISHER_IMAGE}" >/dev/null

printf 'BACKEND_IMAGE=%s\n' "${BACKEND_IMAGE}"
printf 'AUTH_POLICY_IMAGE=%s\n' "${AUTH_POLICY_IMAGE}"
printf 'MEDIA_CONTROL_IMAGE=%s\n' "${MEDIA_CONTROL_IMAGE}"
printf 'DASHBOARD_IMAGE=%s\n' "${DASHBOARD_IMAGE}"
printf 'MOBILE_PUBLISHER_IMAGE=%s\n' "${MOBILE_PUBLISHER_IMAGE}"
