#!/usr/bin/env bash
set -euo pipefail

readonly RECOMMENDED_RMEM_MAX=16777216
readonly RECOMMENDED_WMEM_MAX=16777216
readonly RECOMMENDED_CONNTRACK_MAX=262144
readonly RECOMMENDED_EPHEMERAL_PORT_WIDTH=20000

read_sysctl() {
  local key="$1"
  sysctl -n "$key" 2>/dev/null || true
}

print_numeric_check() {
  local key="$1"
  local recommended="$2"
  local current
  current="$(read_sysctl "$key")"
  if [[ -z "$current" ]]; then
    printf '%-36s %-14s recommended>=%s status=missing\n' "$key" "n/a" "$recommended"
    return
  fi
  if (( current >= recommended )); then
    printf '%-36s %-14s recommended>=%s status=ok\n' "$key" "$current" "$recommended"
  else
    printf '%-36s %-14s recommended>=%s status=low\n' "$key" "$current" "$recommended"
  fi
}

print_port_range_check() {
  local current start end width
  current="$(read_sysctl net.ipv4.ip_local_port_range)"
  if [[ -z "$current" ]]; then
    printf '%-36s %-14s recommended_width>=%s status=missing\n' "net.ipv4.ip_local_port_range" "n/a" "$RECOMMENDED_EPHEMERAL_PORT_WIDTH"
    return
  fi
  read -r start end <<<"$current"
  width=$((end - start + 1))
  if (( width >= RECOMMENDED_EPHEMERAL_PORT_WIDTH )); then
    printf '%-36s %s width=%s recommended_width>=%s status=ok\n' "net.ipv4.ip_local_port_range" "$current" "$width" "$RECOMMENDED_EPHEMERAL_PORT_WIDTH"
  else
    printf '%-36s %s width=%s recommended_width>=%s status=low\n' "net.ipv4.ip_local_port_range" "$current" "$width" "$RECOMMENDED_EPHEMERAL_PORT_WIDTH"
  fi
}

main() {
  echo "GCS-Saker UDP/conntrack tuning check"
  print_numeric_check net.core.rmem_max "$RECOMMENDED_RMEM_MAX"
  print_numeric_check net.core.wmem_max "$RECOMMENDED_WMEM_MAX"
  print_numeric_check net.netfilter.nf_conntrack_max "$RECOMMENDED_CONNTRACK_MAX"
  print_port_range_check
}

main "$@"
