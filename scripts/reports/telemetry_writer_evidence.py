#!/usr/bin/env python3
"""Extract aggregate evidence from the class-owned PostgreSQL writer fixture."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from xml.etree import ElementTree

SCHEMA_VERSION = "telemetry-writer-evidence-v1"
SUITE = "kr.co.a4ai.gcssaker.authpolicy.TelemetryWriterLoadPostgresTest"
PREFIX = "telemetry_writer "
MAX_XML_BYTES = 2 * 1024 * 1024
EXPECTED_COUNTS = {"distinct_identities": (64, 64), "same_identity": (64, 1), "duplicate_event": (1, 1)}
INTEGER_FIELDS = frozenset(
    {"workers", "samples", "history", "latest", "calls", "shared_hits", "shared_reads", "temp_written"}
)
DECIMAL_FIELDS = frozenset({"p50_ms", "p95_ms", "exec_ms", "wal_bytes"})
FIELDS = INTEGER_FIELDS | DECIMAL_FIELDS | {"result", "case"}


class TelemetryWriterEvidenceError(RuntimeError):
    """Writer evidence is incomplete or inconsistent."""


def read_suite(path: Path) -> ElementTree.Element:
    if path.stat().st_size > MAX_XML_BYTES:
        raise TelemetryWriterEvidenceError("suite_too_large")
    payload = path.read_bytes()
    if len(payload) > MAX_XML_BYTES or b"<!DOCTYPE" in payload.upper() or b"<!ENTITY" in payload.upper():
        raise TelemetryWriterEvidenceError("suite_xml_unsafe")
    root = ElementTree.fromstring(payload)
    if root.tag != "testsuite" or root.get("name") != SUITE:
        raise TelemetryWriterEvidenceError("suite_identity_invalid")
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
    if counts != actual or counts["tests"] != 5:
        raise TelemetryWriterEvidenceError("suite_counts_invalid")
    return counts


def measurement_fields(line: str) -> dict[str, str]:
    pairs = [token.split("=", 1) for token in line.split()[1:]]
    if any(len(pair) != 2 for pair in pairs):
        raise TelemetryWriterEvidenceError("measurement_invalid")
    fields = dict(pairs)
    if len(fields) != len(pairs) or fields.keys() != FIELDS or fields["result"] != "PASS":
        raise TelemetryWriterEvidenceError("measurement_fields_invalid")
    return fields


def measurement_values(fields: dict[str, str]) -> tuple[dict[str, int], dict[str, float]]:
    integers = {key: int(fields[key]) for key in INTEGER_FIELDS}
    decimals = {key: float(fields[key]) for key in DECIMAL_FIELDS}
    if any(value < 0 for value in integers.values()) or any(
        not math.isfinite(value) or value < 0 for value in decimals.values()
    ):
        raise TelemetryWriterEvidenceError("measurement_numbers_invalid")
    return integers, decimals


def measurement(line: str) -> dict[str, str | int | float]:
    fields = measurement_fields(line)
    integers, decimals = measurement_values(fields)
    expected = EXPECTED_COUNTS.get(fields["case"])
    if expected != (integers["history"], integers["latest"]) or (
        integers["workers"],
        integers["samples"],
        integers["calls"],
    ) != (4, 64, 64):
        raise TelemetryWriterEvidenceError("measurement_counts_invalid")
    if integers["temp_written"] != 0 or decimals["p95_ms"] < decimals["p50_ms"]:
        raise TelemetryWriterEvidenceError("measurement_contract_invalid")
    return {"case": fields["case"], **integers, **decimals}


def build_report(directory: Path, source_commit: str) -> dict[str, object]:
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise TelemetryWriterEvidenceError("source_revision_invalid")
    root = read_suite(directory / ("TEST-" + SUITE + ".xml"))
    counts = suite_counts(root)
    result = "FAIL" if counts["failures"] or counts["errors"] else "BLOCKED" if counts["skipped"] else "PASS"
    measurements = [
        measurement(line) for line in root.findtext("system-out", "").splitlines() if line.startswith(PREFIX)
    ]
    if result == "PASS" and (len(measurements) != 3 or {row["case"] for row in measurements} != EXPECTED_COUNTS.keys()):
        raise TelemetryWriterEvidenceError("measurement_profiles_missing_or_duplicate")
    return {
        "schema_version": SCHEMA_VERSION,
        "source_commit": source_commit,
        "result": result,
        "tests": counts,
        "measurements": measurements,
        "scope": "real migrated PostgreSQL, canonical writer, four pooled workers; bounded correctness/cost fixture, not capacity or soak qualification",
        "statistics_scope": "top-level owned writer CTE only; transaction/SET/trigger work is not a separate counted statement; exec_ms excludes client queue/commit time",
        "production_deployment": "NOT_RUN",
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
    except (TelemetryWriterEvidenceError, OSError, ValueError, ElementTree.ParseError):
        result = "FAIL"
    print(json.dumps({"schema_version": SCHEMA_VERSION, "result": result, "error_code": "writer_evidence_unavailable"}))
    return 1


if __name__ == "__main__":
    sys.exit(main())
