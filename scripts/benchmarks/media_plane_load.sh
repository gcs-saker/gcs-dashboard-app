#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
mode="${1:---check}"
edge_base_url="${EDGE_BASE_URL:-https://a4ai.121-159-26-245.sslip.io}"
stage_levels="${MEDIA_LOAD_STAGES:-1,2,4}"
stage_seconds="${MEDIA_LOAD_STAGE_SECONDS:-20}"
fps="${MEDIA_LOAD_FPS:-15}"
ice_url="${MEDIA_LOAD_ICE_URL:-stun:a4ai.121-159-26-245.sslip.io:3478}"
relay_only="${MEDIA_LOAD_RELAY_ONLY:-0}"
turn_username="${TURN_USERNAME:-}"
turn_password="${TURN_PASSWORD:-}"
stream_prefix="${MEDIA_LOAD_STREAM_PREFIX:-raw/load/synthetic}"

validate_contract() {
  bash -n "$0"
  [[ "${stage_levels}" =~ ^[1-9][0-9]*(,[1-9][0-9]*)*$ ]]
  [[ "${stage_seconds}" =~ ^[1-9][0-9]*$ ]]
  [[ "${relay_only}" == "0" || "${relay_only}" == "1" ]]
  python3 "${root}/scripts/smoke/webrtc_whip_publish_smoke.py" --check
  python3 "${root}/scripts/smoke/webrtc_ice_smoke.py" --check
  echo "media plane load contract passed"
}

run_stage() {
  local concurrency="$1"
  local stage_id="$2"
  local -a publisher_pids=()
  local -a receiver_pids=()
  local -a auth_args=()
  local failed=0

  if [[ "${relay_only}" == "1" ]]; then
    [[ -n "${turn_username}" && -n "${turn_password}" ]] || {
      echo "TURN_USERNAME and TURN_PASSWORD are required for relay-only load" >&2
      return 2
    }
    auth_args=(--ice-username "${turn_username}" --ice-credential "${turn_password}")
  fi

  for index in $(seq 1 "${concurrency}"); do
    local stream_path="${stream_prefix}/${stage_id}/${index}"
    python3 "${root}/scripts/smoke/webrtc_whip_publish_smoke.py" \
      --run --require-connected --no-audio \
      --whip-url "${edge_base_url}/webrtc/${stream_path}/whip" \
      --ice-server-url "${ice_url}" "${auth_args[@]}" \
      --fps "${fps}" --publish-seconds "$((stage_seconds + 10))" \
      >"/tmp/gcs-media-publisher-${stage_id}-${index}.log" 2>&1 &
    publisher_pids+=("$!")
  done
  sleep 5

  for index in $(seq 1 "${concurrency}"); do
    local stream_path="${stream_prefix}/${stage_id}/${index}"
    python3 "${root}/scripts/smoke/webrtc_ice_smoke.py" \
      --run --require-connected --require-video-frame \
      --whep-url "${edge_base_url}/webrtc/${stream_path}/whep" \
      --ice-server-url "${ice_url}" "${auth_args[@]}" \
      --hold-seconds "${stage_seconds}" \
      >"/tmp/gcs-media-receiver-${stage_id}-${index}.log" 2>&1 &
    receiver_pids+=("$!")
  done

  for pid in "${receiver_pids[@]}"; do wait "${pid}" || failed=$((failed + 1)); done
  for pid in "${publisher_pids[@]}"; do wait "${pid}" || failed=$((failed + 1)); done
  printf 'stage=%s concurrency=%s failed_peers=%s\n' "${stage_id}" "${concurrency}" "${failed}"
  [[ "${failed}" -eq 0 ]]
}

case "${mode}" in
  --check)
    validate_contract
    ;;
  --run)
    stage_id=0
    IFS=',' read -ra levels <<<"${stage_levels}"
    for concurrency in "${levels[@]}"; do
      stage_id=$((stage_id + 1))
      run_stage "${concurrency}" "${stage_id}"
    done
    ;;
  *)
    echo "usage: $0 [--check|--run]" >&2
    exit 2
    ;;
esac
