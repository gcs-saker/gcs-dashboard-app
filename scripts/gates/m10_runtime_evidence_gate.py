#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_VERSION = "m10-runtime-evidence-gate-v1"

EXTERNAL_NAT_REQUIRED_METRICS = (
    "WHEP answer latency ms",
    "First video frame latency ms",
    "Audio/video sync offset ms",
    "Selected ICE pair",
    "ICE path",
    "Direct ICE path ratio",
    "Relay ICE path ratio",
    "Relay fallback reason",
    "External NAT smoke wall latency ms",
)

DB_RUNTIME_REQUIRED_METRICS = (
    "postgisVersion",
    "historyRowsForSmoke",
    "explain.executionTimeMs",
    "explain.sharedHitBlocks",
    "explain.sharedReadBlocks",
    "explain.sharedDirtiedBlocks",
    "explain.sharedWrittenBlocks",
    "explain.walRecords",
    "explain.walBytes",
)


@dataclass(frozen=True)
class GateCommand:
    name: str
    description: str
    command: list[str]


def build_commands() -> list[GateCommand]:
    return [
        GateCommand(
            name="external_nat_contract",
            description="외부 NAT WebRTC smoke가 WHIP/WHEP, TURN, first-frame, audio/video sync metric을 출력할 수 있는지 확인한다.",
            command=["bash", "scripts/smoke/m7_external_nat_webrtc_smoke.sh", "--check"],
        ),
        GateCommand(
            name="performance_schema",
            description="API/HLS/WebRTC/ICE/audio-video sync benchmark metric 이름을 고정한다.",
            command=["python3", "scripts/benchmarks/m7_performance_benchmark_matrix.py", "--check"],
        ),
        GateCommand(
            name="postgis_runtime_contract",
            description="PostGIS runtime smoke가 EXPLAIN ANALYZE BUFFERS WAL 계약을 노출하는지 확인한다.",
            command=["python3", "scripts/smoke/postgis_runtime_smoke.py", "--check"],
        ),
        GateCommand(
            name="postgis_runtime_run",
            description="기본 compose PostgreSQL/PostGIS에서 latest upsert, bounded viewport query, BUFFERS/WAL plan을 실제 실행한다.",
            command=["python3", "scripts/smoke/postgis_runtime_smoke.py"],
        ),
    ]


def build_check_report() -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "commands": [
            {
                "name": command.name,
                "description": command.description,
                "command": command.command,
            }
            for command in build_commands()
        ],
        "externalNatRequiredMetrics": list(EXTERNAL_NAT_REQUIRED_METRICS),
        "dbRuntimeRequiredMetrics": list(DB_RUNTIME_REQUIRED_METRICS),
        "evidencePolicy": {
            "externalNat": "manual/live network evidence is required before production capacity claims",
            "database": "PostGIS smoke must include EXPLAIN (ANALYZE, BUFFERS, WAL) summary",
            "secrets": "reports must not include passwords, tokens, private keys, or operator secrets",
        },
    }


def run_command(command: GateCommand, timeout_seconds: int) -> dict[str, Any]:
    started = time.perf_counter()
    result = subprocess.run(
        command.command,
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )
    elapsed_ms = (time.perf_counter() - started) * 1000
    return {
        "name": command.name,
        "description": command.description,
        "command": command.command,
        "passed": result.returncode == 0,
        "returnCode": result.returncode,
        "durationMs": round(elapsed_ms, 3),
        "stdoutPreview": result.stdout[:1200],
        "stderrPreview": result.stderr[:1200],
    }


def run_json_command(command: GateCommand, timeout_seconds: int) -> tuple[dict[str, Any], dict[str, Any] | None]:
    started = time.perf_counter()
    result = subprocess.run(
        command.command,
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )
    elapsed_ms = (time.perf_counter() - started) * 1000
    command_result = {
        "name": command.name,
        "description": command.description,
        "command": command.command,
        "passed": result.returncode == 0,
        "returnCode": result.returncode,
        "durationMs": round(elapsed_ms, 3),
        "stdoutPreview": result.stdout[:1200],
        "stderrPreview": result.stderr[:1200],
    }
    if result.returncode != 0:
        return command_result, None
    return command_result, json.loads(result.stdout)


def validate_external_nat_report(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {
            "status": "manual-required",
            "passed": False,
            "reason": "external NAT report file was not provided",
            "requiredMetrics": list(EXTERNAL_NAT_REQUIRED_METRICS),
        }
    content = path.read_text(encoding="utf-8")
    missing = [metric for metric in EXTERNAL_NAT_REQUIRED_METRICS if metric not in content]
    extracted = {
        "whepAnswerLatencyMs": extract_number(content, "WHEP answer latency ms"),
        "firstVideoFrameLatencyMs": extract_number(content, "First video frame latency ms"),
        "audioVideoSyncOffsetMs": extract_number(content, "Audio/video sync offset ms"),
        "externalNatWallLatencyMs": extract_number(content, "External NAT smoke wall latency ms"),
        "directIcePathRatio": extract_number(content, "Direct ICE path ratio"),
        "relayIcePathRatio": extract_number(content, "Relay ICE path ratio"),
        "icePath": extract_text_after_colon(content, "ICE path"),
        "relayFallbackReason": extract_text_after_colon(content, "Relay fallback reason"),
    }
    return {
        "status": "validated" if not missing else "missing-metrics",
        "passed": not missing,
        "path": str(path),
        "missingMetrics": missing,
        "metrics": extracted,
    }


def validate_postgis_runtime(payload: dict[str, Any]) -> dict[str, Any]:
    explain = payload.get("explain", {})
    missing = []
    if not payload.get("postgisVersion"):
        missing.append("postgisVersion")
    if "historyRowsForSmoke" not in payload:
        missing.append("historyRowsForSmoke")
    for key in (
        "executionTimeMs",
        "sharedHitBlocks",
        "sharedReadBlocks",
        "sharedDirtiedBlocks",
        "sharedWrittenBlocks",
        "walRecords",
        "walBytes",
    ):
        if key not in explain:
            missing.append(f"explain.{key}")
    return {
        "status": "validated" if not missing else "missing-metrics",
        "passed": bool(payload.get("passed")) and not missing,
        "missingMetrics": missing,
        "metrics": {
            "postgisVersion": payload.get("postgisVersion"),
            "historyRowsForSmoke": payload.get("historyRowsForSmoke"),
            "explain": explain,
        },
    }


def extract_number(content: str, label: str) -> float | None:
    pattern = rf"{re.escape(label)}:\s*([0-9]+(?:\.[0-9]+)?)"
    match = re.search(pattern, content)
    return float(match.group(1)) if match else None


def extract_text_after_colon(content: str, label: str) -> str | None:
    pattern = rf"{re.escape(label)}:\s*(.+)"
    match = re.search(pattern, content)
    return match.group(1).strip() if match else None


def run_gate(args: argparse.Namespace) -> dict[str, Any]:
    contract_commands = build_commands()[:3]
    command_results = [run_command(command, args.timeout_seconds) for command in contract_commands]
    postgis_result, postgis_payload = run_json_command(build_commands()[3], args.timeout_seconds)
    postgis_validation = (
        validate_postgis_runtime(postgis_payload)
        if postgis_payload is not None
        else {
            "status": "failed",
            "passed": False,
            "reason": postgis_result["stderrPreview"] or postgis_result["stdoutPreview"],
        }
    )
    external_nat_validation = validate_external_nat_report(args.external_nat_report)
    complete = (
        all(result["passed"] for result in command_results)
        and postgis_result["passed"]
        and postgis_validation["passed"]
        and (external_nat_validation["passed"] or args.allow_missing_external_nat)
    )
    return {
        "schemaVersion": SCHEMA_VERSION,
        "complete": complete,
        "contractCommands": command_results,
        "postgisRuntime": {
            "command": postgis_result,
            "validation": postgis_validation,
        },
        "externalNat": external_nat_validation,
        "allowMissingExternalNat": args.allow_missing_external_nat,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run M10 live WebRTC NAT and DB runtime evidence gate.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Print stable runtime evidence contract.")
    mode.add_argument("--run", action="store_true", help="Run contract checks and PostGIS runtime smoke.")
    parser.add_argument("--external-nat-report", type=Path, help="Text report produced by m7_external_nat_webrtc_smoke.sh --run.")
    parser.add_argument("--allow-missing-external-nat", action="store_true", help="Allow local runs to pass without live external NAT evidence.")
    parser.add_argument("--timeout-seconds", type=int, default=120)
    args = parser.parse_args()
    if not args.check and not args.run:
        args.check = True
    return args


def main() -> int:
    args = parse_args()
    payload = build_check_report() if args.check else run_gate(args)
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    if args.run and not payload["complete"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
