#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EDGE_BASE_URL="${EDGE_BASE_URL:-http://127.0.0.1:8080}"
STREAM_PREFIX="${STREAM_PREFIX:-raw/load/p0}"
STREAM_COUNT="${STREAM_COUNT:-16}"
DURATION_SECONDS="${DURATION_SECONDS:-1800}"
LATENCY_SAMPLES="${LATENCY_SAMPLES:-10}"
CPU_LIMIT_PERCENT="${CPU_LIMIT_PERCENT:-70}"
NIC_LIMIT_PERCENT="${NIC_LIMIT_PERCENT:-80}"
NETWORK_INTERFACE="${NETWORK_INTERFACE:-}"
NETWORK_CAPACITY_MBPS="${NETWORK_CAPACITY_MBPS:-}"
REPORT_FILE="${REPORT_FILE:-}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
PUBLISH_TOKEN="${PUBLISH_TOKEN:-}"
PIDS=()

usage() {
  echo "Usage: scripts/m5_sixteen_stream_acceptance.sh [--check|--run]" >&2
}

cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "$pid" >/dev/null 2>&1 || true; done
  for pid in "${PIDS[@]:-}"; do wait "$pid" >/dev/null 2>&1 || true; done
}
trap cleanup EXIT

if [[ "${1:---check}" == "--check" ]]; then
  [[ "$STREAM_COUNT" -eq 16 ]]
  [[ "$DURATION_SECONDS" -ge 1800 ]]
  [[ "$LATENCY_SAMPLES" -ge 10 ]]
  grep -q 'First video frame latency ms:' "$ROOT/scripts/webrtc_ice_smoke.py"
  grep -q 'WHIP answer latency ms:' "$ROOT/scripts/webrtc_whip_publish_smoke.py"
  echo "16-stream acceptance contract passed"
  exit 0
elif [[ "$1" != "--run" ]]; then
  usage
  exit 2
fi

[[ "$STREAM_COUNT" -eq 16 ]] || { echo "P0 acceptance requires exactly 16 streams" >&2; exit 2; }
[[ "$DURATION_SECONDS" -ge 1800 ]] || { echo "P0 acceptance requires at least 1800 seconds" >&2; exit 2; }
[[ "$LATENCY_SAMPLES" -ge 10 ]] || { echo "P0 acceptance requires at least 10 latency samples" >&2; exit 2; }
command -v "$PYTHON_BIN" >/dev/null

if [[ -z "$NETWORK_INTERFACE" ]]; then
  NETWORK_INTERFACE="$(ip route show default | awk 'NR==1 {print $5}')"
fi
[[ -n "$NETWORK_INTERFACE" && -r "/sys/class/net/$NETWORK_INTERFACE/statistics/rx_bytes" ]] || {
  echo "NETWORK_INTERFACE must name a measurable host interface" >&2; exit 2;
}
if [[ -z "$NETWORK_CAPACITY_MBPS" && -r "/sys/class/net/$NETWORK_INTERFACE/speed" ]]; then
  NETWORK_CAPACITY_MBPS="$(cat "/sys/class/net/$NETWORK_INTERFACE/speed")"
fi
[[ "$NETWORK_CAPACITY_MBPS" =~ ^[0-9]+([.][0-9]+)?$ ]] || {
  echo "NETWORK_CAPACITY_MBPS must be provided when interface speed is unavailable" >&2; exit 2;
}

mkdir -p "$(dirname "${REPORT_FILE:-/tmp/gcs-saker-p0-load-report.txt}")"
REPORT_FILE="${REPORT_FILE:-/tmp/gcs-saker-p0-load-report.txt}"
: > "$REPORT_FILE"
auth_args=()
[[ -z "$PUBLISH_TOKEN" ]] || auth_args=(--publish-token "$PUBLISH_TOKEN")

started_epoch="$(date +%s)"
initial_rx="$(cat "/sys/class/net/$NETWORK_INTERFACE/statistics/rx_bytes")"
for index in $(seq -w 1 "$STREAM_COUNT"); do
  stream_path="${STREAM_PREFIX}/${index}"
  "$PYTHON_BIN" "$ROOT/scripts/webrtc_whip_publish_smoke.py" --run \
    --whip-url "${EDGE_BASE_URL}/webrtc/${stream_path}/whip" \
    --publish-seconds "$((DURATION_SECONDS + 20))" --require-connected --no-audio \
    "${auth_args[@]}" > "/tmp/gcs-saker-publisher-${index}.log" 2>&1 &
  PIDS+=("$!")
done
sleep 10

cpu_peak=0
latency_total=0
for sample in $(seq 1 "$LATENCY_SAMPLES"); do
  index="$(printf '%02d' "$(( (sample - 1) % STREAM_COUNT + 1 ))")"
  probe="/tmp/gcs-saker-whep-${sample}.log"
  "$PYTHON_BIN" "$ROOT/scripts/webrtc_ice_smoke.py" --run --require-connected --require-video-frame \
    --whep-url "${EDGE_BASE_URL}/webrtc/${STREAM_PREFIX}/${index}/whep" > "$probe" 2>&1
  latency="$(awk -F': ' '/First video frame latency ms:/ {print $2; exit}' "$probe")"
  [[ "$latency" =~ ^[0-9]+([.][0-9]+)?$ ]] || { echo "missing latency sample $sample" >&2; exit 1; }
  latency_total="$(awk -v total="$latency_total" -v value="$latency" 'BEGIN {printf "%.3f", total + value}')"
  read -r _ u1 n1 s1 i1 w1 x1 y1 z1 _ < /proc/stat
  total1=$((u1 + n1 + s1 + i1 + w1 + x1 + y1 + z1)); idle1=$((i1 + w1))
  sleep 1
  read -r _ u2 n2 s2 i2 w2 x2 y2 z2 _ < /proc/stat
  total2=$((u2 + n2 + s2 + i2 + w2 + x2 + y2 + z2)); idle2=$((i2 + w2))
  cpu="$(awk -v total="$((total2 - total1))" -v idle="$((idle2 - idle1))" 'BEGIN {printf "%.3f", (total-idle)/total*100}')"
  cpu_peak="$(awk -v peak="$cpu_peak" -v value="$cpu" 'BEGIN {print value > peak ? value : peak}')"
  printf 'latency_sample_%s_ms=%s host_cpu_percent=%s\n' "$sample" "$latency" "$cpu" >> "$REPORT_FILE"
  sleep "$((DURATION_SECONDS / LATENCY_SAMPLES - 1))"
done

elapsed="$(( $(date +%s) - started_epoch ))"
final_rx="$(cat "/sys/class/net/$NETWORK_INTERFACE/statistics/rx_bytes")"
nic_percent="$(awk -v bytes="$((final_rx - initial_rx))" -v seconds="$elapsed" -v mbps="$NETWORK_CAPACITY_MBPS" \
  'BEGIN {printf "%.3f", ((bytes * 8) / seconds / 1000000) / mbps * 100}')"
latency_average="$(awk -v total="$latency_total" -v count="$LATENCY_SAMPLES" 'BEGIN {printf "%.3f", total / count}')"

for pid in "${PIDS[@]}"; do kill -0 "$pid" 2>/dev/null || { echo "publisher exited before 30-minute gate" >&2; exit 1; }; done
{
  echo "stream_count=$STREAM_COUNT"
  echo "duration_seconds=$elapsed"
  echo "latency_samples=$LATENCY_SAMPLES"
  echo "average_first_frame_latency_ms=$latency_average"
  echo "peak_host_cpu_percent=$cpu_peak"
  echo "average_nic_utilization_percent=$nic_percent"
} | tee -a "$REPORT_FILE"

awk -v value="$latency_average" 'BEGIN {exit !(value <= 2000)}'
awk -v value="$cpu_peak" -v limit="$CPU_LIMIT_PERCENT" 'BEGIN {exit !(value < limit)}'
awk -v value="$nic_percent" -v limit="$NIC_LIMIT_PERCENT" 'BEGIN {exit !(value < limit)}'
echo "16-stream and latency acceptance passed" | tee -a "$REPORT_FILE"
