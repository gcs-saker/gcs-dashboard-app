#!/usr/bin/env bash
set -euo pipefail
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/gates/m10_media_control_concurrency_gate.sh" "$@"
