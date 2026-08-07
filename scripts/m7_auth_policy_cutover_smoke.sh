#!/usr/bin/env bash
set -euo pipefail
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/smoke/m7_auth_policy_cutover_smoke.sh" "$@"
