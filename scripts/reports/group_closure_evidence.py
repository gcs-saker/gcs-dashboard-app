#!/usr/bin/env python3
"""Extract bounded, non-identifying hierarchy test evidence from owned JUnit suites."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from xml.etree import ElementTree

SCHEMA_VERSION = "group-closure-evidence-v1"
MAX_XML_BYTES = 2 * 1024 * 1024
SUITES = (
    "kr.co.a4ai.gcssaker.authpolicy.domain.GroupClosurePlanTest",
    "kr.co.a4ai.gcssaker.authpolicy.GroupHierarchyTransactionsTest",
    "kr.co.a4ai.gcssaker.authpolicy.GroupClosurePostgresTest",
    "kr.co.a4ai.gcssaker.authpolicy.GroupClosureBenchmarkPostgresTest",
)
MEASUREMENT_FIELDS = frozenset(
    {"result", "variant", "groups", "closure_rows", "row_mutations", "samples", "p50_ms", "p95_ms"}
)


class GroupClosureEvidenceError(RuntimeError):
    """Evidence is absent or incompatible; do not attach original XML or failures."""


def suite_result(path: Path, expected: str) -> tuple[dict[str, object], list[str]]:
    if path.stat().st_size > MAX_XML_BYTES:
        raise GroupClosureEvidenceError("report_too_large")
    root = ElementTree.fromstring(path.read_bytes())
    if root.tag != "testsuite" or root.get("name") != expected:
        raise GroupClosureEvidenceError("suite_identity_invalid")
    counts = {field: int(root.get(field, "-1")) for field in ("tests", "failures", "errors", "skipped")}
    if counts["tests"] <= 0 or any(value < 0 for value in counts.values()):
        raise GroupClosureEvidenceError("suite_counts_invalid")
    stdout = root.findtext("system-out", default="")
    lines = [line.strip() for line in stdout.splitlines() if line.startswith("group_closure_benchmark ")]
    return {"suite": expected.rsplit(".", 1)[-1], **counts}, lines


def measurement(line: str) -> dict[str, object]:
    pairs = [token.split("=", 1) for token in line.split()[1:]]
    if any(len(pair) != 2 for pair in pairs):
        raise GroupClosureEvidenceError("measurement_invalid")
    fields = dict(pairs)
    if len(fields) != len(pairs) or fields.keys() != MEASUREMENT_FIELDS or fields["result"] != "PASS":
        raise GroupClosureEvidenceError("measurement_contract_invalid")
    if fields["variant"] not in {"legacy", "delta"}:
        raise GroupClosureEvidenceError("measurement_variant_invalid")
    integers = {key: int(fields[key]) for key in ("groups", "closure_rows", "row_mutations", "samples")}
    timings = {key: float(fields[key]) for key in ("p50_ms", "p95_ms")}
    if any(value < 0 for value in integers.values()) or integers["samples"] < 3:
        raise GroupClosureEvidenceError("measurement_bounds_invalid")
    if (
        any(not math.isfinite(value) or value < 0 for value in timings.values())
        or timings["p95_ms"] < timings["p50_ms"]
    ):
        raise GroupClosureEvidenceError("measurement_duration_invalid")
    return {"variant": fields["variant"], **integers, **timings}


def build_report(directory: Path, source_commit: str) -> dict[str, object]:
    if re.fullmatch(r"[0-9a-f]{40}", source_commit) is None:
        raise GroupClosureEvidenceError("source_revision_invalid")
    suites: list[dict[str, object]] = []
    measurements: list[dict[str, object]] = []
    for name in SUITES:
        result, lines = suite_result(directory / ("TEST-" + name + ".xml"), name)
        suites.append(result)
        measurements.extend(measurement(line) for line in lines)
    status = status_for(suites)
    if status == "PASS" and (
        len(measurements) != 2 or {item["variant"] for item in measurements} != {"legacy", "delta"}
    ):
        raise GroupClosureEvidenceError("measurement_pair_missing")
    if status == "PASS" and any(
        measurements[0][key] != measurements[1][key] for key in ("groups", "closure_rows", "samples")
    ):
        raise GroupClosureEvidenceError("measurement_pair_inconsistent")
    return {
        "schema_version": SCHEMA_VERSION,
        "source_commit": source_commit,
        "result": status,
        "suites": suites,
        "measurements": measurements,
        "scope": "synthetic local hierarchy repository/transaction only; not HTTP or physical media qualification",
        "production_deployment": "NOT_RUN",
        "physical_media_qualification": "NOT_RUN",
    }


def status_for(suites: list[dict[str, object]]) -> str:
    if any(suite["failures"] != 0 or suite["errors"] != 0 for suite in suites):
        return "FAIL"
    if any(suite["skipped"] != 0 for suite in suites):
        return "BLOCKED"
    return "PASS"


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
        print(
            json.dumps(
                {"schema_version": SCHEMA_VERSION, "result": "NOT_RUN", "error_code": "hierarchy_evidence_missing"}
            )
        )
    except (GroupClosureEvidenceError, OSError, ValueError, ElementTree.ParseError):
        print(
            json.dumps({"schema_version": SCHEMA_VERSION, "result": "FAIL", "error_code": "hierarchy_evidence_invalid"})
        )
    return 1


if __name__ == "__main__":
    sys.exit(main())
