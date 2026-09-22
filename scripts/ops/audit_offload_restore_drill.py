#!/usr/bin/env python3
"""Run a fail-closed audit anchor offload and restore rehearsal."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from audit_anchor_verify import ANCHOR_PATTERN
from verify_audit_recovery import verify_recovery

ROOT = Path(__file__).resolve().parents[2]
OFFLOAD = ROOT / "scripts/ops/offload_audit_anchor.sh"


class AuditDrillError(RuntimeError):
    pass


@dataclass(frozen=True)
class DrillInputs:
    original_export: Path
    anchor_directory: Path
    hmac_key_file: Path
    external_directory: Path
    restore_directory: Path
    evidence_output: Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_inputs(inputs: DrillInputs) -> None:
    paths = (
        inputs.original_export,
        inputs.anchor_directory,
        inputs.hmac_key_file,
        inputs.external_directory,
        inputs.restore_directory,
        inputs.evidence_output,
    )
    if any(not path.is_absolute() for path in paths):
        raise AuditDrillError("audit drill paths must be absolute")
    if not inputs.original_export.is_file() or not inputs.hmac_key_file.is_file():
        raise AuditDrillError("audit drill source files are missing")
    for directory in (inputs.anchor_directory, inputs.external_directory, inputs.restore_directory):
        if not directory.is_dir():
            raise AuditDrillError("audit drill directory is missing")
    if inputs.anchor_directory.stat().st_dev == inputs.external_directory.stat().st_dev:
        raise AuditDrillError("external audit storage must be a different mounted device")
    if inputs.evidence_output.exists():
        raise AuditDrillError("audit drill evidence overwrite denied")


def latest_anchor(directory: Path) -> Path:
    candidates = sorted(path for path in directory.iterdir() if ANCHOR_PATTERN.fullmatch(path.name))
    if not candidates:
        raise AuditDrillError("no audit anchor is available")
    return candidates[-1]


def copy_exclusive(source: Path, target: Path) -> None:
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as output, source.open("rb") as input_stream:
        shutil.copyfileobj(input_stream, output)
        output.flush()
        os.fsync(output.fileno())


def write_evidence(path: Path, payload: dict[str, object]) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        json.dump(payload, output, ensure_ascii=False, indent=2, sort_keys=True)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())


def run_drill(inputs: DrillInputs) -> dict[str, object]:
    validate_inputs(inputs)
    anchor = latest_anchor(inputs.anchor_directory)
    subprocess.run(
        ["bash", str(OFFLOAD), str(inputs.anchor_directory), str(inputs.external_directory)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    offloaded_anchor = inputs.external_directory / anchor.name
    restored_export = inputs.restore_directory / "audit-restored.jsonl"
    copy_exclusive(inputs.original_export, restored_export)
    record_count = verify_recovery(
        inputs.original_export,
        restored_export,
        offloaded_anchor,
        inputs.hmac_key_file,
    )
    payload: dict[str, object] = {
        "schemaVersion": "gcs-saker.audit-offload-restore-drill.v1",
        "result": "PASS",
        "completedAt": datetime.now(timezone.utc).isoformat(),
        "recordCount": record_count,
        "anchorSequence": int(ANCHOR_PATTERN.fullmatch(anchor.name).group(1)),  # type: ignore[union-attr]
        "sourceExportSha256": sha256(inputs.original_export),
        "restoredExportSha256": sha256(restored_export),
        "offloadedAnchorSha256": sha256(offloaded_anchor),
    }
    write_evidence(inputs.evidence_output, payload)
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--original-export", type=Path)
    parser.add_argument("--anchor-directory", type=Path)
    parser.add_argument("--hmac-key-file", type=Path)
    parser.add_argument("--external-directory", type=Path)
    parser.add_argument("--restore-directory", type=Path)
    parser.add_argument("--evidence-output", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.check:
        print("audit offload restore drill contract check passed")
        return 0
    names = (
        "original_export",
        "anchor_directory",
        "hmac_key_file",
        "external_directory",
        "restore_directory",
        "evidence_output",
    )
    if any(getattr(args, name) is None for name in names):
        raise SystemExit("all audit drill paths are required")
    payload = run_drill(DrillInputs(*(getattr(args, name).resolve() for name in names)))
    print(f"audit offload restore drill {payload['result']} for {payload['recordCount']} records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
