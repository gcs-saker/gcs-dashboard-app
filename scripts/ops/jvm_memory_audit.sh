#!/usr/bin/env bash
set -euo pipefail

project_name="${COMPOSE_PROJECT_NAME:-gcs-saker-m2-production}"
container="${project_name}-auth-policy-1"

docker inspect --format \
  'container={{.Name}} memory_limit={{.HostConfig.Memory}} pids_limit={{.HostConfig.PidsLimit}} restarts={{.RestartCount}} oom={{.State.OOMKilled}}' \
  "${container}"
docker stats --no-stream --format 'cpu={{.CPUPerc}} memory={{.MemUsage}} pids={{.PIDs}}' "${container}"
docker exec "${container}" sh -lc '
  ps -o pid,rss,vsz,nlwp,args -p 1
  if command -v jcmd >/dev/null 2>&1; then
    jcmd 1 GC.heap_info
  else
    echo "heap_detail=NOT_AVAILABLE runtime_image_has_no_jcmd"
  fi
'
