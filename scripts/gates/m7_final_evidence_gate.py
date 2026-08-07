#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_VERSION = "m7-final-evidence-gate-v1"


@dataclass(frozen=True)
class EvidenceCommand:
    name: str
    category: str
    description: str
    command: list[str]
    required: bool = True
    needs_docker: bool = False


@dataclass(frozen=True)
class EvidenceResult:
    name: str
    category: str
    description: str
    command: list[str]
    status: str
    duration_ms: float
    stdout: str
    stderr: str

    def to_json(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "category": self.category,
            "description": self.description,
            "command": self.command,
            "status": self.status,
            "durationMs": round(self.duration_ms, 3),
            "stdoutPreview": self.stdout[:800],
            "stderrPreview": self.stderr[:800],
        }


def build_commands() -> list[EvidenceCommand]:
    return [
        EvidenceCommand(
            name="v2_completion_gate",
            category="release-readiness",
            description="Saker v2 release blocker와 missing item을 JSON으로 확인한다.",
            command=["python3", "scripts/gates/v2_completion_gate.py", "--json"],
        ),
        EvidenceCommand(
            name="architecture_intent_gate",
            category="architecture-evidence",
            description="설계 의도와 코드/문서/compose evidence path가 연결되어 있는지 확인한다.",
            command=["python3", "scripts/gates/architecture_intent_gate.py", "--json"],
        ),
        EvidenceCommand(
            name="benchmark_schema",
            category="performance-contract",
            description="API/HLS/WebRTC/ICE path benchmark metric schema를 고정한다.",
            command=[
                "python3",
                "scripts/benchmarks/m7_performance_benchmark_matrix.py",
                "--check",
            ],
        ),
        EvidenceCommand(
            name="telemetry_bulk_benchmark",
            category="db-throughput",
            description="telemetry write buffer와 bulk SQL statement 절감 효과를 synthetic benchmark로 확인한다.",
            command=[
                "python3",
                "scripts/benchmarks/telemetry_bulk_flush_benchmark.py",
                "--records",
                "1000",
                "--batch-size",
                "100",
            ],
        ),
        EvidenceCommand(
            name="webrtc_ice_contract",
            category="streaming-low-latency",
            description="selected ICE pair, direct/relay ratio, fallback reason static contract를 확인한다.",
            command=["python3", "scripts/smoke/webrtc_ice_smoke.py", "--check"],
        ),
        EvidenceCommand(
            name="grpc_contract",
            category="protocol-runtime",
            description="gRPC gateway descriptor와 internal bidi streaming contract를 확인한다.",
            command=["python3", "scripts/smoke/grpc_runtime_smoke.py", "--run"],
        ),
        EvidenceCommand(
            name="ai_overlay_contract",
            category="ai-overlay",
            description="mock AI overlay metadata가 protobuf event와 dashboard DTO를 왕복하는지 확인한다.",
            command=["python3", "scripts/smoke/ai_overlay_sidecar_smoke.py", "--run"],
        ),
        EvidenceCommand(
            name="mqtt_hardened_contract",
            category="mqtt-control-plane",
            description="hardened MQTT protobuf telemetry/control profile 계약을 확인한다.",
            command=[
                "python3",
                "scripts/smoke/mqtt_hardened_profile_smoke.py",
                "--check",
            ],
        ),
        EvidenceCommand(
            name="m10_runtime_evidence_contract",
            category="runtime-observability",
            description="외부 NAT WebRTC와 PostGIS runtime benchmark evidence schema를 확인한다.",
            command=[
                "python3",
                "scripts/gates/m10_runtime_evidence_gate.py",
                "--check",
            ],
        ),
        EvidenceCommand(
            name="closed_network_static",
            category="closed-network",
            description="폐쇄망 profile, offline map, internal STUN/TURN/time source, offline artifact runbook을 확인한다.",
            command=["python3", "scripts/gates/closed_network_static_check.py"],
        ),
        EvidenceCommand(
            name="default_compose_config",
            category="compose-integration",
            description="기본 single-node compose model이 해석되는지 확인한다.",
            command=[
                "docker",
                "compose",
                "--env-file",
                "deploy/compose/.env.single-node.example",
                "-f",
                "deploy/compose/compose.single-node.poc.yml",
                "config",
                "--quiet",
            ],
            needs_docker=True,
        ),
        EvidenceCommand(
            name="closed_network_compose_config",
            category="compose-integration",
            description="폐쇄망 env profile로 single-node compose model이 해석되는지 확인한다.",
            command=[
                "docker",
                "compose",
                "--env-file",
                "deploy/compose/.env.closed-network.example",
                "-f",
                "deploy/compose/compose.single-node.poc.yml",
                "config",
                "--quiet",
            ],
            needs_docker=True,
        ),
    ]


def build_check_report() -> dict[str, Any]:
    commands = build_commands()
    return {
        "schemaVersion": SCHEMA_VERSION,
        "commands": [
            {
                "name": command.name,
                "category": command.category,
                "description": command.description,
                "required": command.required,
                "needsDocker": command.needs_docker,
            }
            for command in commands
        ],
        "requiredCategories": sorted(
            {command.category for command in commands if command.required}
        ),
    }


def run_command(command: EvidenceCommand, timeout_seconds: int) -> EvidenceResult:
    if command.needs_docker and shutil.which("docker") is None:
        return EvidenceResult(
            name=command.name,
            category=command.category,
            description=command.description,
            command=command.command,
            status="skipped-docker-unavailable",
            duration_ms=0,
            stdout="",
            stderr="docker CLI is not available",
        )
    started = time.perf_counter()
    process = subprocess.run(
        command.command,
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )
    duration_ms = (time.perf_counter() - started) * 1000
    status = "passed" if process.returncode == 0 else "failed"
    return EvidenceResult(
        name=command.name,
        category=command.category,
        description=command.description,
        command=command.command,
        status=status,
        duration_ms=duration_ms,
        stdout=process.stdout,
        stderr=process.stderr,
    )


def run_gate(timeout_seconds: int) -> dict[str, Any]:
    results = [run_command(command, timeout_seconds) for command in build_commands()]
    failed_required = [
        result.name
        for command, result in zip(build_commands(), results, strict=True)
        if command.required and result.status == "failed"
    ]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "complete": not failed_required,
        "failedRequired": failed_required,
        "results": [result.to_json() for result in results],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the M7 final benchmark and architecture evidence gate."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--check",
        action="store_true",
        help="Print the stable evidence command contract.",
    )
    mode.add_argument("--run", action="store_true", help="Run the evidence commands.")
    parser.add_argument("--timeout-seconds", type=int, default=120)
    args = parser.parse_args()
    if not args.check and not args.run:
        args.check = True
    return args


def main() -> int:
    args = parse_args()
    payload = build_check_report() if args.check else run_gate(args.timeout_seconds)
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    if args.run and not payload["complete"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
