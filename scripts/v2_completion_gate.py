#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import yaml


REPO_ROOT = Path(__file__).resolve().parents[1]
MATRIX_PATH = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_v2_completion_matrix.yml"
SCHEMA_VERSION = "gcs-saker-v2-completion-matrix-v1"


class V2CompletionGateError(AssertionError):
    pass


def load_matrix() -> dict[str, Any]:
    with MATRIX_PATH.open("r", encoding="utf-8") as file:
        matrix = yaml.safe_load(file)
    if not isinstance(matrix, dict):
        raise V2CompletionGateError("v2 completion matrix must be a YAML object")
    if matrix.get("schemaVersion") != SCHEMA_VERSION:
        raise V2CompletionGateError(f"schemaVersion must be {SCHEMA_VERSION}")
    gates = matrix.get("requiredGates")
    if not isinstance(gates, list) or not gates:
        raise V2CompletionGateError("requiredGates must be a non-empty list")
    return matrix


def evaluate_matrix(matrix: dict[str, Any]) -> dict[str, Any]:
    gates = matrix["requiredGates"]
    blockers = [gate for gate in gates if gate.get("releaseBlocker") is True]
    deferred = [gate for gate in gates if gate.get("releaseBlocker") is False]
    missing_items = sum(len(gate.get("missing", [])) for gate in gates)
    issue_numbers = [gate.get("issue") for gate in gates]
    if len(issue_numbers) != len(set(issue_numbers)):
        raise V2CompletionGateError("each v2 gate must point to a unique issue")

    for gate in gates:
        for field in ["id", "issue", "title", "expectedStateForV2", "currentState", "evidence"]:
            if field not in gate:
                raise V2CompletionGateError(f"{gate.get('id', 'unknown')} is missing {field}")
        if not gate.get("evidence"):
            raise V2CompletionGateError(f"{gate['id']} must list evidence paths")

    return {
        "schemaVersion": SCHEMA_VERSION,
        "releaseName": matrix["releaseName"],
        "releaseReadiness": matrix["releaseReadiness"],
        "decision": matrix["decision"],
        "trackerIssue": matrix["trackerIssue"],
        "releaseGateIssue": matrix["releaseGateIssue"],
        "totalGates": len(gates),
        "releaseBlockers": len(blockers),
        "deferredOrNonBlocking": len(deferred),
        "missingItems": missing_items,
        "blockingIssues": [gate["issue"] for gate in blockers],
        "nonBlockingIssues": [gate["issue"] for gate in deferred],
        "complete": len(blockers) == 0,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Evaluate Saker v2 completion readiness.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable v2 completion status.")
    parser.add_argument(
        "--require-complete",
        action="store_true",
        help="Fail unless there are no release blockers. Use only for release cutover.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    result = evaluate_matrix(load_matrix())
    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(
            "Saker v2 completion gate: "
            f"{result['releaseReadiness']}, "
            f"{result['releaseBlockers']} blockers, "
            f"{result['missingItems']} missing items",
        )
    if args.require_complete and not result["complete"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
