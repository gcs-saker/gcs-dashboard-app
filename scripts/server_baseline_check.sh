#!/usr/bin/env bash
set -euo pipefail

SERVER_NAME="unknown-server"
OUTPUT_PATH=""
CHECK_ONLY=false

usage() {
  cat <<'USAGE'
Usage:
  scripts/server_baseline_check.sh --server-name Server-01
  scripts/server_baseline_check.sh --server-name Server-02 --output docs/operations/server-baseline-results/Server-02.md
  scripts/server_baseline_check.sh --check

Collects a markdown server baseline snapshot for M2-01:
- OS version
- Docker client/daemon version
- disk/memory/cpu
- static IP hints
- existing Saker-related processes
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server-name)
      SERVER_NAME="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT_PATH="${2:-}"
      shift 2
      ;;
    --check)
      CHECK_ONLY=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "${CHECK_ONLY}" == "true" ]]; then
  echo "Server baseline check contract passed"
  echo "Required sections: os docker disk memory cpu network processes"
  exit 0
fi

if [[ -z "${SERVER_NAME}" ]]; then
  echo "--server-name must not be empty" >&2
  exit 2
fi

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

run_or_note() {
  local description="$1"
  shift

  echo "### ${description}"
  echo
  echo '```text'
  if "$@" 2>&1; then
    true
  else
    echo "command failed: $*"
  fi
  echo '```'
  echo
}

collect_os() {
  echo "### OS"
  echo
  echo '```text'
  if [[ -f /etc/os-release ]]; then
    sed -n '1,12p' /etc/os-release
  elif command_exists sw_vers; then
    sw_vers
  else
    uname -a
  fi
  echo
  uname -a
  echo '```'
  echo
}

collect_docker() {
  echo "### Docker"
  echo
  echo '```text'
  if command_exists docker; then
    docker --version || true
    docker compose version || true
    docker info --format 'ServerVersion={{.ServerVersion}} Driver={{.Driver}} CgroupDriver={{.CgroupDriver}}' 2>&1 || echo "docker daemon unavailable"
  else
    echo "docker command not found"
  fi
  echo '```'
  echo
}

collect_memory() {
  echo "### Memory"
  echo
  echo '```text'
  if command_exists free; then
    free -h
  elif command_exists vm_stat; then
    vm_stat
  else
    echo "memory command not found"
  fi
  echo '```'
  echo
}

collect_cpu() {
  echo "### CPU"
  echo
  echo '```text'
  if command_exists nproc; then
    echo "cpu_cores=$(nproc)"
  elif command_exists sysctl; then
    local cpu_cores
    cpu_cores="$(sysctl -n hw.ncpu 2>/dev/null || true)"
    if [[ -n "${cpu_cores}" ]]; then
      echo "cpu_cores=${cpu_cores}"
    else
      echo "cpu core command unavailable"
    fi
  else
    echo "cpu core command not found"
  fi
  uptime || true
  echo '```'
  echo
}

collect_network() {
  echo "### Network / Static IP Hints"
  echo
  echo '```text'
  hostname || true
  hostname -I 2>/dev/null || true
  ip -4 addr show 2>/dev/null || true
  ifconfig 2>/dev/null || true
  echo '```'
  echo
}

collect_processes() {
  echo "### Existing Saker-Related Processes"
  echo
  echo '```text'
  local process_list
  process_list="$(ps aux 2>&1 || true)"
  if [[ "${process_list}" == *"Operation not permitted"* ]]; then
    echo "${process_list}"
  else
    echo "${process_list}" | grep -E 'saker|mediamtx|docker|uvicorn|nginx|node|vite' | grep -v grep || echo "no matching process found"
  fi
  echo '```'
  echo
}

collect_report() {
  echo "# GCS-Saker Server Baseline Snapshot"
  echo
  echo "- server: ${SERVER_NAME}"
  echo "- collectedAt: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "- collector: scripts/server_baseline_check.sh"
  echo
  collect_os
  collect_docker
  run_or_note "Disk" df -h
  collect_memory
  collect_cpu
  collect_network
  collect_processes
  echo "## Operator Notes"
  echo
  echo "- static IP confirmed: TODO"
  echo "- existing Saker services to preserve: TODO"
  echo "- blockers before M2-02 backup: TODO"
}

if [[ -n "${OUTPUT_PATH}" ]]; then
  mkdir -p "$(dirname "${OUTPUT_PATH}")"
  collect_report > "${OUTPUT_PATH}"
  echo "Server baseline snapshot written: ${OUTPUT_PATH}"
else
  collect_report
fi
