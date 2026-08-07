#!/usr/bin/env python3
"""Reject copied script implementations and validate compatibility entrypoints."""

from __future__ import annotations

import hashlib
from collections import defaultdict
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_ROOT = REPOSITORY_ROOT / "scripts"
COMPATIBILITY_ENTRYPOINTS = {
    "ai_overlay_sidecar_smoke.py": "smoke/ai_overlay_sidecar_smoke.py",
    "architecture_intent_gate.py": "gates/architecture_intent_gate.py",
    "closed_network_static_check.py": "gates/closed_network_static_check.py",
    "create_milestones.py": "github/create_milestones.py",
    "docker_env_check.py": "gates/docker_env_check.py",
    "dragonfly_profile_smoke.py": "smoke/dragonfly_profile_smoke.py",
    "generate_test_report.py": "reports/generate_test_report.py",
    "grpc_runtime_smoke.py": "smoke/grpc_runtime_smoke.py",
    "health_readiness_check.py": "ops/health_readiness_check.py",
    "m10_media_control_concurrency_gate.sh": "gates/m10_media_control_concurrency_gate.sh",
    "m10_runtime_evidence_gate.py": "gates/m10_runtime_evidence_gate.py",
    "m7_auth_policy_cutover_smoke.sh": "smoke/m7_auth_policy_cutover_smoke.sh",
    "m7_dashboard_first_frame_smoke.sh": "smoke/m7_dashboard_first_frame_smoke.sh",
    "m7_db_query_plan_contract.py": "benchmarks/m7_db_query_plan_contract.py",
    "m7_external_nat_webrtc_smoke.sh": "smoke/m7_external_nat_webrtc_smoke.sh",
    "m7_final_evidence_gate.py": "gates/m7_final_evidence_gate.py",
    "m7_media_control_cutover_smoke.sh": "smoke/m7_media_control_cutover_smoke.sh",
    "m7_performance_benchmark_matrix.py": "benchmarks/m7_performance_benchmark_matrix.py",
    "m7_publish_play_smoke.sh": "smoke/m7_publish_play_smoke.sh",
    "m7_regression_gate.sh": "gates/m7_regression_gate.sh",
    "m7_seed_smoke_user.py": "smoke/m7_seed_smoke_user.py",
    "m7_single_node_runtime_smoke.sh": "smoke/m7_single_node_runtime_smoke.sh",
    "m7_streaming_stability_soak.sh": "smoke/m7_streaming_stability_soak.sh",
    "mqtt_hardened_profile_smoke.py": "smoke/mqtt_hardened_profile_smoke.py",
    "postgis_runtime_smoke.py": "smoke/postgis_runtime_smoke.py",
    "publish_sample_stream.sh": "smoke/publish_sample_stream.sh",
    "server_baseline_check.sh": "ops/server_baseline_check.sh",
    "server_udp_tuning_check.sh": "ops/server_udp_tuning_check.sh",
    "streaming_core_perf_check.py": "benchmarks/streaming_core_perf_check.py",
    "streaming_e2e_smoke.sh": "smoke/streaming_e2e_smoke.sh",
    "telemetry_bulk_flush_benchmark.py": "benchmarks/telemetry_bulk_flush_benchmark.py",
    "turn_relay_smoke.py": "smoke/turn_relay_smoke.py",
    "turnutils_relay_smoke.sh": "smoke/turnutils_relay_smoke.sh",
    "v2_completion_gate.py": "gates/v2_completion_gate.py",
    "webrtc_ice_smoke.py": "smoke/webrtc_ice_smoke.py",
    "webrtc_whip_publish_smoke.py": "smoke/webrtc_whip_publish_smoke.py",
}


def _script_files() -> list[Path]:
    return sorted(path for path in SCRIPTS_ROOT.rglob("*") if path.is_file() and "__pycache__" not in path.parts)


def _validate_no_byte_for_byte_copies(errors: list[str]) -> None:
    paths_by_digest: defaultdict[str, list[Path]] = defaultdict(list)
    for path in _script_files():
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        paths_by_digest[digest].append(path.relative_to(REPOSITORY_ROOT))

    for paths in paths_by_digest.values():
        if len(paths) > 1:
            errors.append("duplicate script bodies: " + ", ".join(map(str, paths)))


def _validate_compatibility_entrypoints(errors: list[str]) -> None:
    for legacy_name, canonical_name in COMPATIBILITY_ENTRYPOINTS.items():
        legacy_path = SCRIPTS_ROOT / legacy_name
        canonical_path = SCRIPTS_ROOT / canonical_name
        if not canonical_path.is_file():
            errors.append(f"missing canonical script: {canonical_path.relative_to(REPOSITORY_ROOT)}")
            continue
        if not legacy_path.is_file():
            errors.append(f"missing compatibility entrypoint: {legacy_path.relative_to(REPOSITORY_ROOT)}")
            continue

        source = legacy_path.read_text(encoding="utf-8")
        canonical_parts = Path(canonical_name).parts
        if any(part not in source for part in canonical_parts):
            errors.append(f"entrypoint does not target {canonical_name}: scripts/{legacy_name}")
        if legacy_path.suffix == ".py" and "run_path(" not in source:
            errors.append(f"Python entrypoint must delegate with run_path: scripts/{legacy_name}")
        if legacy_path.suffix == ".sh" and "exec " not in source:
            errors.append(f"shell entrypoint must delegate with exec: scripts/{legacy_name}")
        # Ruff may wrap a long canonical path over several lines. A wrapper is
        # still intentionally tiny; the other assertions enforce delegation.
        if len(source.splitlines()) > 20:
            errors.append(f"compatibility entrypoint contains implementation logic: scripts/{legacy_name}")


def main() -> int:
    errors: list[str] = []
    _validate_no_byte_for_byte_copies(errors)
    _validate_compatibility_entrypoints(errors)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("script entrypoint contract passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
