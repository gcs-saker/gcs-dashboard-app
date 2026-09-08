#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_CONFIG="${1:?usage: stage_edge_runtime_config.sh SOURCE_CONFIG TARGET_CONFIG}"
TARGET_CONFIG="${2:?usage: stage_edge_runtime_config.sh SOURCE_CONFIG TARGET_CONFIG}"

[[ "${SOURCE_CONFIG}" = /* && -f "${SOURCE_CONFIG}" ]] || {
  echo "SOURCE_CONFIG must be an existing absolute file" >&2
  exit 2
}
[[ "${TARGET_CONFIG}" = /* ]] || {
  echo "TARGET_CONFIG must be absolute" >&2
  exit 2
}

root_real="$(realpath "${ROOT}")"
target_parent="$(dirname "${TARGET_CONFIG}")"
mkdir -p "${target_parent}"
target_parent_real="$(realpath "${target_parent}")"
case "${target_parent_real}" in
  "${root_real}"|"${root_real}"/*|*/releases|*/releases/*)
    echo "TARGET_CONFIG must be outside source and release checkouts" >&2
    exit 2
    ;;
esac

staged="$(mktemp "${target_parent}/.edge-nginx.XXXXXX")"
cleanup() { rm -f "${staged}"; }
trap cleanup EXIT
install -m 600 "${SOURCE_CONFIG}" "${staged}"
setfacl -b "${staged}"
setfacl -m u:101:r "${staged}"
mv -f "${staged}" "${TARGET_CONFIG}"
trap - EXIT
printf 'edge_runtime_config=%s sha256=%s\n' \
  "${TARGET_CONFIG}" "$(sha256sum "${TARGET_CONFIG}" | awk '{ print $1 }')"
