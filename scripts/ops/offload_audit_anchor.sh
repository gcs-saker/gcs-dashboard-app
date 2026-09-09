#!/usr/bin/env bash
set -euo pipefail

source_dir="${1:?Usage: offload_audit_anchor.sh <source-directory> <external-directory>}"
external_dir="${2:?external directory is required}"
[[ "${source_dir}" = /* && "${external_dir}" = /* ]] || { echo "audit paths must be absolute" >&2; exit 2; }
[[ -d "${source_dir}" && -d "${external_dir}" ]] || { echo "audit paths must already exist" >&2; exit 2; }
[[ "$(stat -c '%d' "${source_dir}")" != "$(stat -c '%d' "${external_dir}")" ]] || {
  echo "external audit storage must be a different mounted device" >&2
  exit 1
}
usage="$(df -P "${source_dir}" | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
[[ "${usage}" =~ ^[0-9]+$ ]] || { echo "audit volume usage is unavailable" >&2; exit 1; }
if (( usage >= 75 )); then
  echo "audit_volume_warning threshold=75 result=warning" >&2
  exit 1
fi
latest="$(find "${source_dir}" -maxdepth 1 -type f -name 'anchor-*.json' -printf '%T@ %p\n' | sort -nr | head -n1 | cut -d' ' -f2-)"
[[ -n "${latest}" && -s "${latest}" ]] || { echo "no audit anchor is available" >&2; exit 1; }
target="${external_dir}/$(basename "${latest}")"
[[ ! -e "${target}" ]] || { echo "external anchor already exists; overwrite denied" >&2; exit 1; }
install -m 400 "${latest}" "${target}"
[[ "$(sha256sum "${latest}" | cut -d' ' -f1)" == "$(sha256sum "${target}" | cut -d' ' -f1)" ]] || {
  echo "external anchor digest mismatch" >&2
  exit 1
}
echo "audit anchor offloaded to independent read-only storage"
