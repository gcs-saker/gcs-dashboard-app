#!/usr/bin/env python3
"""Reject copied script implementations and validate compatibility entrypoints."""

from __future__ import annotations

import hashlib
from collections import defaultdict
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_ROOT = REPOSITORY_ROOT / "scripts"
COMPATIBILITY_ENTRYPOINTS = {
    "create_milestones.py": "github/create_milestones.py",
    "m7_db_query_plan_contract.py": "benchmarks/m7_db_query_plan_contract.py",
    "m7_performance_benchmark_matrix.py": "benchmarks/m7_performance_benchmark_matrix.py",
    "m7_seed_smoke_user.py": "smoke/m7_seed_smoke_user.py",
    "server_udp_tuning_check.sh": "ops/server_udp_tuning_check.sh",
    "turn_relay_smoke.py": "smoke/turn_relay_smoke.py",
    "turnutils_relay_smoke.sh": "smoke/turnutils_relay_smoke.sh",
}


def _script_files() -> list[Path]:
    return sorted(
        path
        for path in SCRIPTS_ROOT.rglob("*")
        if path.is_file() and "__pycache__" not in path.parts
    )


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
            errors.append(
                f"missing canonical script: {canonical_path.relative_to(REPOSITORY_ROOT)}"
            )
            continue
        if not legacy_path.is_file():
            errors.append(
                f"missing compatibility entrypoint: {legacy_path.relative_to(REPOSITORY_ROOT)}"
            )
            continue

        source = legacy_path.read_text(encoding="utf-8")
        canonical_parts = Path(canonical_name).parts
        if any(part not in source for part in canonical_parts):
            errors.append(
                f"entrypoint does not target {canonical_name}: scripts/{legacy_name}"
            )
        if legacy_path.suffix == ".py" and "run_path(" not in source:
            errors.append(
                f"Python entrypoint must delegate with run_path: scripts/{legacy_name}"
            )
        if legacy_path.suffix == ".sh" and "exec " not in source:
            errors.append(
                f"shell entrypoint must delegate with exec: scripts/{legacy_name}"
            )
        if len(source.splitlines()) > 12:
            errors.append(
                f"compatibility entrypoint contains implementation logic: scripts/{legacy_name}"
            )


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
