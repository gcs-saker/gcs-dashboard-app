from __future__ import annotations

import asyncio
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "smoke" / "ai_overlay_sidecar_smoke.py"


def load_smoke_module():
    spec = importlib.util.spec_from_file_location("ai_overlay_sidecar_smoke", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_ai_overlay_sidecar_smoke_module_builds_contract_and_runtime_payload() -> None:
    module = load_smoke_module()

    check_payload = module.build_check_report()
    run_payload = asyncio.run(module.run_mock_overlay_smoke())

    assert check_payload["schemaVersion"] == "ai-overlay-sidecar-smoke-v1"
    assert run_payload["eventCount"] == 1
    assert run_payload["mediaPath"] == "not-carried-by-ai-sidecar"


def test_ai_overlay_sidecar_smoke_check_prints_stable_contract() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--check"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["schemaVersion"] == "ai-overlay-sidecar-smoke-v1"
    assert payload["streamId"] == "raw.sample.front"
    assert "AiOverlayEvent protobuf" in " ".join(payload["contract"])
    assert "not media frames" in " ".join(payload["contract"])


def test_ai_overlay_sidecar_smoke_run_round_trips_mock_overlay_event() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--run"],
        check=False,
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["schemaVersion"] == "ai-overlay-sidecar-smoke-v1"
    assert payload["streamId"] == "raw.sample.front"
    assert payload["eventCount"] == 1
    assert payload["protobufBytes"] > 0
    assert payload["mediaPath"] == "not-carried-by-ai-sidecar"
    assert payload["firstEvent"]["eventId"] == "mock-person-001"
    assert payload["firstEvent"]["label"] == "person"
    assert payload["firstEvent"]["observedUnixMillis"] == 1_779_436_800_000
    assert payload["firstEvent"]["receivedUnixMillis"] == 1_779_436_801_000
    assert payload["dashboardDtoFields"] == [
        "detections",
        "frame",
        "generatedAt",
        "reportText",
        "riskScore",
        "schemaVersion",
        "streamId",
    ]
