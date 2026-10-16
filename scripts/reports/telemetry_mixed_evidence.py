#!/usr/bin/env python3
"""Export aggregate mixed PostgreSQL reader/writer evidence, never raw SQL or logs."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from xml.etree import ElementTree

SCHEMA_VERSION = "telemetry-mixed-evidence-v1"
SUITE = "kr.co.a4ai.gcssaker.authpolicy.TelemetryMixedLoadPostgresTest"
PREFIX = "telemetry_mixed "
MAX_XML_BYTES = 2 * 1024 * 1024
PROFILES = {"small_page": 1, "max_page": 500}
OPERATIONS = {"read", "write"}
INTEGER_FIELDS = {
    "page_size",
    "workers",
    "samples",
    "rows",
    "history_added",
    "calls",
    "shared_hits",
    "shared_reads",
    "temp_written",
}
DECIMAL_FIELDS = {"p50_ms", "p95_ms", "exec_ms", "wal_bytes"}
FIELDS = INTEGER_FIELDS | DECIMAL_FIELDS | {"result", "profile", "operation"}


class TelemetryMixedEvidenceError(RuntimeError):
    """The owned mixed-load evidence cannot establish its verification contract."""


def read_suite(directory: Path) -> ElementTree.Element:
    path = directory / ("TEST-" + SUITE + ".xml")
    with path.open("rb") as stream:
        payload = stream.read(MAX_XML_BYTES + 1)
    if len(payload) > MAX_XML_BYTES or b"<!DOCTYPE" in payload.upper() or b"<!ENTITY" in payload.upper():
        raise TelemetryMixedEvidenceError("suite_xml_unsafe")
    root = ElementTree.fromstring(payload)
    if root.tag != "testsuite" or root.get("name") != SUITE:
        raise TelemetryMixedEvidenceError("suite_identity_invalid")
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
        raise TelemetryMixedEvidenceError("suite_counts_invalid")
    return counts


def measurement_fields(line: str) -> dict[str, str]:
    pairs = [token.split("=", 1) for token in line.split()[1:]]
    if any(len(pair) != 2 for pair in pairs):
        raise TelemetryMixedEvidenceError("measurement_invalid")
    fields = dict(pairs)
    if len(fields) != len(pairs) or fields.keys() != FIELDS or fields["result"] != "PASS":
        raise TelemetryMixedEvidenceError("measurement_fields_invalid")
    return fields


def measurement_values(fields: dict[str, str]) -> tuple[dict[str, int], dict[str, float]]:
    integers = {key: int(fields[key]) for key in INTEGER_FIELDS}
    decimals = {key: float(fields[key]) for key in DECIMAL_FIELDS}
    if any(value < 0 for value in integers.values()) or any(
        not math.isfinite(value) or value < 0 for value in decimals.values()
    ):
        raise TelemetryMixedEvidenceError("measurement_numbers_invalid")
    return integers, decimals


def validate_profile(fields: dict[str, str], integers: dict[str, int]) -> None:
    if fields["operation"] not in OPERATIONS or PROFILES.get(fields["profile"]) != integers["page_size"]:
        raise TelemetryMixedEvidenceError("measurement_profile_invalid")
    expected = {"workers": 4, "samples": 64, "calls": 64, "rows": 100001, "history_added": 64, "temp_written": 0}
    if any(integers[key] != value for key, value in expected.items()):
        raise TelemetryMixedEvidenceError("measurement_counts_invalid")


def measurement(line: str) -> dict[str, str | int | float]:
    fields = measurement_fields(line)
    integers, decimals = measurement_values(fields)
    validate_profile(fields, integers)
    if decimals["p95_ms"] < decimals["p50_ms"]:
        raise TelemetryMixedEvidenceError("measurement_percentile_invalid")
    return {"profile": fields["profile"], "operation": fields["operation"], **integers, **decimals}


def validate_matrix(measurements: list[dict[str, str | int | float]], tests: int) -> None:
    expected = {(profile, operation) for profile in PROFILES for operation in OPERATIONS}
    actual = {(row["profile"], row["operation"]) for row in measurements}
    if tests != 4 or len(measurements) != 4 or actual != expected:
        raise TelemetryMixedEvidenceError("measurement_profiles_missing_or_duplicate")


def build_report(directory: Path, source_commit: str) -> dict[str, object]:
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise TelemetryMixedEvidenceError("source_revision_invalid")
    root = read_suite(directory)
    counts = suite_counts(root)
    result = "FAIL" if counts["failures"] or counts["errors"] else "BLOCKED" if counts["skipped"] else "PASS"
    measurements = [
        measurement(line) for line in root.findtext("system-out", "").splitlines() if line.startswith(PREFIX)
    ]
    if result == "PASS":
        validate_matrix(measurements, counts["tests"])
    return {
        "schema_version": SCHEMA_VERSION,
        "source_commit": source_commit,
        "result": result,
        "tests": counts,
        "measurements": measurements,
        "scope": "100001 latest rows, two readers and two writers in bounded waves; read timings include invariant assertions; staged commit/rollback visibility is separately verified",
        "statistics_scope": "owned top-level SELECT and writer CTE only; not all round trips, whole-server WAL, capacity or soak qualification",
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
    except (TelemetryMixedEvidenceError, OSError, ValueError, ElementTree.ParseError):
        result = "FAIL"
    print(json.dumps({"schema_version": SCHEMA_VERSION, "result": result, "error_code": "mixed_evidence_unavailable"}))
    return 1


if __name__ == "__main__":
    sys.exit(main())
