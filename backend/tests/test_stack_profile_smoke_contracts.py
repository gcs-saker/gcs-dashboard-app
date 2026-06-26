from __future__ import annotations

from pathlib import Path
import json
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
GRPC_SMOKE = REPO_ROOT / "scripts" / "grpc_runtime_smoke.py"
DRAGONFLY_SMOKE = REPO_ROOT / "scripts" / "dragonfly_profile_smoke.py"
POSTGIS_SMOKE = REPO_ROOT / "scripts" / "postgis_runtime_smoke.py"


def run_check(script: Path) -> dict:
    result = subprocess.run(
        [sys.executable, str(script), "--check"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_grpc_runtime_smoke_reports_prototype_state_and_missing_active_gates() -> None:
    payload = run_check(GRPC_SMOKE)

    assert payload["schemaVersion"] == "grpc-runtime-smoke-v1"
    assert payload["status"] == "runtime-partial"
    assert payload["descriptorCommand"][:3] == [
        "protoc",
        f"--proto_path={REPO_ROOT / 'contracts' / 'proto'}",
        f"--descriptor_set_out={REPO_ROOT / 'tmp' / 'gcs-saker-grpc-gateway.pb'}",
    ]
    assert "client implementation behind MessageSender abstraction" in payload["implementedRuntime"]
    assert "SakerGatewayService.Exchange server implementation in media-control" in payload["implementedRuntime"]
    assert "native/device gateway runtime client" in payload["remainingBeforeFullActive"]
    assert "compose internal network" in payload["promotionGate"]


def test_dragonfly_profile_smoke_reports_profile_state_and_equivalence_gate() -> None:
    payload = run_check(DRAGONFLY_SMOKE)

    assert payload["schemaVersion"] == "dragonfly-profile-smoke-v1"
    assert payload["status"] == "profile"
    assert "-f" in payload["configCommand"]
    assert str(REPO_ROOT / "deploy" / "compose" / "compose.dragonfly.override.yml") in payload["configCommand"]
    assert "media-control starts with DragonFly-compatible Redis protocol" in payload["checks"]
    assert "Redis and DragonFly runtime smoke results are equivalent" in payload["promotionGate"]


def test_postgis_profile_smoke_reports_runtime_query_contract() -> None:
    payload = run_check(POSTGIS_SMOKE)

    assert payload["schemaVersion"] == "postgis-runtime-smoke-v1"
    assert "postgres-geo" in payload["command"]
    assert "EXPLAIN (ANALYZE, BUFFERS)" in payload["sql"]
