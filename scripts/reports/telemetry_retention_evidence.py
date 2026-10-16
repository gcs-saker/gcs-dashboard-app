#!/usr/bin/env python3
"""Extract owner-only bounded-retention verification and aggregate cost evidence."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from types import MappingProxyType
from xml.etree import ElementTree

SCHEMA_VERSION = "telemetry-retention-evidence-v1"
SUITE = "kr.co.a4ai.gcssaker.authpolicy.TelemetryRetentionPostgresTest"
MAX_XML_BYTES = 2 * 1024 * 1024
EXPECTED = MappingProxyType(
    {
        "rows": 100000,
        "samples": 9,
        "batch_size": 1000,
        "history_deleted": 9000,
        "points_deleted": 9000,
        "history_remaining": 91001,
        "points_remaining": 91000,
        "calls": 9,
        "history_index_used": 1,
    }
)
INTEGER_FIELDS = frozenset(EXPECTED) | frozenset(
    {"shared_hits", "shared_reads", "temp_written", "history_temp_written", "points_sort_nodes", "points_temp_written"}
)
DECIMAL_FIELDS = frozenset({"p50_ms", "p95_ms", "exec_ms", "wal_bytes"})
FIELDS = INTEGER_FIELDS | DECIMAL_FIELDS | frozenset({"result"})


class TelemetryRetentionEvidenceError(RuntimeError):
    """Bounded-retention evidence does not establish the declared contract."""


def read_suite(directory: Path) -> ElementTree.Element:
    with (directory / ("TEST-" + SUITE + ".xml")).open("rb") as stream:
        payload = stream.read(MAX_XML_BYTES + 1)
    if len(payload) > MAX_XML_BYTES or b"<!DOCTYPE" in payload.upper() or b"<!ENTITY" in payload.upper():
        raise TelemetryRetentionEvidenceError("suite_xml_unsafe")
    root = ElementTree.fromstring(payload)
    if root.tag != "testsuite" or root.get("name") != SUITE:
        raise TelemetryRetentionEvidenceError("suite_identity_invalid")
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
        raise TelemetryRetentionEvidenceError("suite_counts_invalid")
    return counts


def measurement_fields(line: str) -> dict[str, str]:
    pairs = [token.split("=", 1) for token in line.split()[1:]]
    if any(len(pair) != 2 for pair in pairs):
        raise TelemetryRetentionEvidenceError("measurement_invalid")
    fields = dict(pairs)
    if len(fields) != len(pairs) or fields.keys() != FIELDS or fields["result"] != "PASS":
        raise TelemetryRetentionEvidenceError("measurement_fields_invalid")
    return fields


def measurement_values(fields: dict[str, str]) -> tuple[dict[str, int], dict[str, float]]:
    integers = {key: int(fields[key]) for key in INTEGER_FIELDS}
    decimals = {key: float(fields[key]) for key in DECIMAL_FIELDS}
    if any(value < 0 for value in integers.values()) or any(
        not math.isfinite(value) or value < 0 for value in decimals.values()
    ):
        raise TelemetryRetentionEvidenceError("measurement_numbers_invalid")
    return integers, decimals


def measurement(line: str) -> dict[str, int | float]:
    integers, decimals = measurement_values(measurement_fields(line))
    if any(integers[key] != value for key, value in EXPECTED.items()):
        raise TelemetryRetentionEvidenceError("measurement_counts_invalid")
    if decimals["p95_ms"] < decimals["p50_ms"] or decimals["p95_ms"] >= 3000:
        raise TelemetryRetentionEvidenceError("measurement_latency_invalid")
    return {**integers, **decimals}


def verification_result(counts: dict[str, int], measurements: list[dict[str, int | float]]) -> str:
    if counts["failures"] or counts["errors"]:
        return "FAIL"
    if counts["skipped"]:
        return "BLOCKED"
    if counts["tests"] != 19 or len(measurements) != 1:
        raise TelemetryRetentionEvidenceError("verification_cases_missing_or_duplicate")
    return "PASS"


def build_report(directory: Path, source_commit: str) -> dict[str, object]:
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise TelemetryRetentionEvidenceError("source_revision_invalid")
    root = read_suite(directory)
    counts = suite_counts(root)
    measurements = [
        measurement(line)
        for line in root.findtext("system-out", "").splitlines()
        if line.startswith("telemetry_retention ")
    ]
    result = verification_result(counts, measurements)
    return {
        "schema_version": SCHEMA_VERSION,
        "source_commit": source_commit,
        "result": result,
        "tests": counts,
        "measurements": measurements,
        "scope": "pinned production PostGIS image/schema, real migrations/ownership triggers; 100000 expired rows per history, nine bounded batches, not a full drain or capacity qualification",
        "statistics_scope": "top-level batch function only; not all round trips or commit WAL; retained latest and fresh history verified",
        "performance_qualification": "FAIL"
        if any(row["points_temp_written"] > 0 for row in measurements)
        else "NOT_RUN",
        "legacy_scheduler": "UNCHANGED_UNBOUNDED",
        "production_deployment": "NOT_RUN",
        "physical_mobile": "BLOCKED",
        "media_e2e": "NOT_RUN",
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
    except (TelemetryRetentionEvidenceError, OSError, ValueError, ElementTree.ParseError):
        result = "FAIL"
    print(
        json.dumps({"schema_version": SCHEMA_VERSION, "result": result, "error_code": "retention_evidence_unavailable"})
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
