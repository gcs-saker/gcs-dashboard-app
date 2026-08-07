#!/usr/bin/env bash
set -euo pipefail
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/smoke/m7_dashboard_first_frame_smoke.sh" "$@"
