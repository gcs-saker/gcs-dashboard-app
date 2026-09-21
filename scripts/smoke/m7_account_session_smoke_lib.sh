#!/usr/bin/env bash

issue_account_publish_session() {
  local publish_auth_url="${EDGE_BASE_URL}/media-control/api/v1/account/publish-sessions" payload
  [[ -n "$AUTH_BEARER_TOKEN" ]] || {
    echo "AUTH_BEARER_TOKEN is required to request an authorized WHIP publish URL" >&2
    return 1
  }
  payload="$(SENSOR_ID="$SENSOR_ID" python3 -c \
    'import json,os; print(json.dumps({"sensorId": os.environ["SENSOR_ID"]}))')"
  # shellcheck disable=SC2046
  curl $(tls_args) -fsS \
    -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d "$payload" \
    "$publish_auth_url" >"${SESSION_DIR}/publish-session.json"
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["publishToken"])' \
    "${SESSION_DIR}/publish-session.json" >"${SESSION_DIR}/publish-token"
  chmod 600 "${SESSION_DIR}/publish-session.json" "${SESSION_DIR}/publish-token"
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["publishUrl"])' \
    "${SESSION_DIR}/publish-session.json"
}

resolve_playback_whep_url() {
  local stream_id playback_auth_url
  [[ -n "$AUTH_BEARER_TOKEN" ]] || {
    echo "AUTH_BEARER_TOKEN is required to request an authorized WHEP playback URL" >&2
    return 1
  }
  stream_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["streamId"])' \
    "${SESSION_DIR}/publish-session.json")"
  playback_auth_url="${EDGE_BASE_URL}/media-control/api/v1/streams/${stream_id}/playback"
  # shellcheck disable=SC2046
  curl $(tls_args) -fsS \
    -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" \
    -H "Accept: application/json" "$playback_auth_url" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["playbackUrls"]["webrtc"])'
}

resolve_playback_whep_url_with_retry() {
  local attempt=1 output status line
  while [[ "$attempt" -le "$WHEP_RETRY_COUNT" ]]; do
    set +e
    output="$(resolve_playback_whep_url 2>&1)"
    status=$?
    set -e
    if [[ "$status" -eq 0 && -n "$output" ]]; then
      [[ -z "$PUBLISHER_STARTED_MS" ]] || \
        append_report "Stream visibility latency ms: $(($(now_ms) - PUBLISHER_STARTED_MS))" >&2
      printf '%s\n' "$output"
      return 0
    fi
    line="authorized WHEP playback URL attempt ${attempt}: waiting for stream registry"
    echo "$line" >&2
    [[ -z "$REPORT_FILE" ]] || printf '%s\n' "$line" >>"$REPORT_FILE"
    sleep "$WHEP_RETRY_DELAY_SECONDS"
    attempt=$((attempt + 1))
  done
  echo "Playback URL was not available after ${WHEP_RETRY_COUNT} bounded attempts" >&2
  return 1
}
