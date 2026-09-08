#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ "${DEPLOYMENT_TARGET:?Set DEPLOYMENT_TARGET=server01-production}" == "server01-production" ]] || {
  echo "only Server-01 is managed" >&2
  exit 2
}

sudo install -o root -g root -m 0644 \
  "${root}/deploy/systemd/gcs-runtime-maintenance.service" \
  /etc/systemd/system/gcs-runtime-maintenance.service
sudo install -o root -g root -m 0644 \
  "${root}/deploy/systemd/gcs-runtime-maintenance.timer" \
  /etc/systemd/system/gcs-runtime-maintenance.timer
sudo systemctl daemon-reload
sudo systemctl enable --now gcs-runtime-maintenance.timer
sudo systemctl start gcs-runtime-maintenance.service
sudo systemctl is-active gcs-runtime-maintenance.timer
