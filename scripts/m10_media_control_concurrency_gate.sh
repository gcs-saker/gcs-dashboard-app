#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_DIR="$ROOT_DIR/services/media-control"

cd "$SERVICE_DIR"

echo "== media-control unit + leak gate =="
go test ./... -count=1

echo "== media-control race gate =="
go test -race ./... -count=1

echo "== media-control coverage =="
go test ./... -cover -count=1
