#!/usr/bin/env python3
"""Export redacted evidence for the bounded, resumable retention caller candidate."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from types import MappingProxyType
from xml.etree import ElementTree

SCHEMA_VERSION = "bounded-retention-evidence-v1"
SUITE = "kr.co.a4ai.gcssaker.authpolicy.BoundedRetentionRunnerPostgresTest"
MAX_XML_BYTES = 2 * 1024 * 1024
EXPECTED = MappingProxyType(
    {
        "complete": {"batches": 3, "history_deleted": 2501, "points_deleted": 2501, "exit_code": 0},
        "resume": {"batches": 4, "history_deleted": 2501, "points_deleted": 2501, "exit_code": 0},
        "locked_recovery": {"batches": 4, "history_deleted": 1, "points_deleted": 1, "exit_code": 0},
    }
)
FIELDS = frozenset({"result", "profile", "batches", "history_deleted", "points_deleted", "exit_code"})


class BoundedRetentionEvidenceError(RuntimeError):
    """Bounded-retention runner evidence is missing or malformed."""


def read_suite(directory: Path) -> ElementTree.Element:
    with (directory / ("TEST-" + SUITE + ".xml")).open("rb") as stream:
        payload = stream.read(MAX_XML_BYTES + 1)
    if len(payload) > MAX_XML_BYTES or b"<!DOCTYPE" in payload.upper() or b"<!ENTITY" in payload.upper():
        raise BoundedRetentionEvidenceError("suite_xml_unsafe")
    root = ElementTree.fromstring(payload)
    if root.tag != "testsuite" or root.get("name") != SUITE:
        raise BoundedRetentionEvidenceError("suite_identity_invalid")
    return root


def suite_counts(root: ElementTree.Element) -> dict[str, int]:
    counts = {key: int(root.get(key, "-1")) for key in ("tests", "failures", "errors", "skipped")}
    cases = root.findall("testcase")
    actual = {
        "tests": len(cases),
        **{
            key: sum(case.find(tag) is not None for case in cases)
            for key, tag in (("failures", "failure"), ("errors", "error"), ("skipped", "skipped"))
        },
    }
    if counts != actual or counts["tests"] <= 0:
        raise BoundedRetentionEvidenceError("suite_counts_invalid")
    return counts


def measurement(line: str) -> dict[str, int | str]:
    pairs = [token.split("=", 1) for token in line.split()[1:]]
    fields = dict(pairs)
    if any(len(pair) != 2 for pair in pairs) or len(fields) != len(pairs) or fields.keys() != FIELDS:
        raise BoundedRetentionEvidenceError("measurement_fields_invalid")
    if fields["result"] != "PASS" or fields["profile"] not in EXPECTED:
        raise BoundedRetentionEvidenceError("measurement_profile_invalid")
    numbers = {key: int(fields[key]) for key in FIELDS - {"result", "profile"}}
    if numbers != EXPECTED[fields["profile"]]:
        raise BoundedRetentionEvidenceError("measurement_contract_invalid")
    return {"profile": fields["profile"], **numbers}


def verification_result(counts: dict[str, int], rows: list[dict[str, int | str]]) -> str:
    if counts["failures"] or counts["errors"]:
        return "FAIL"
    if counts["skipped"]:
        return "BLOCKED"
    if counts["tests"] != 4 or len(rows) != 3 or {row["profile"] for row in rows} != EXPECTED.keys():
        raise BoundedRetentionEvidenceError("verification_cases_missing_or_duplicate")
    return "PASS"


def build_report(directory: Path, source_commit: str) -> dict[str, object]:
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise BoundedRetentionEvidenceError("source_revision_invalid")
    root = read_suite(directory)
    counts = suite_counts(root)
    rows = [
        measurement(line)
        for line in root.findtext("system-out", "").splitlines()
        if line.startswith("bounded_retention ")
    ]
    return {
        "schema_version": SCHEMA_VERSION,
        "source_commit": source_commit,
        "result": verification_result(counts, rows),
        "tests": counts,
        "measurements": rows,
        "scope": "qualified-index gate, fixed-anchor separate commits, complete/partial resume/zero-progress lock recovery on pinned PostGIS",
        "runtime_scheduler_connected": "NO",
        "production_execution": "NOT_RUN",
        "physical_mobile": "BLOCKED",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results-dir", type=Path, required=True)
    parser.add_argument("--source-commit", required=True)
    args = parser.parse_args()
    try:
        report = build_report(args.results_dir, args.source_commit)
        print(json.dumps(report, sort_keys=True))
        return 0 if report["result"] == "PASS" else 1
    except FileNotFoundError:
        result = "NOT_RUN"
    except (BoundedRetentionEvidenceError, OSError, ValueError, ElementTree.ParseError):
        result = "FAIL"
    print(
        json.dumps(
            {"schema_version": SCHEMA_VERSION, "result": result, "error_code": "bounded_retention_evidence_unavailable"}
        )
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
