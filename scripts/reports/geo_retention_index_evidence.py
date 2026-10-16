#!/usr/bin/env python3
"""Extract redacted evidence for the test-only geo retention index candidate."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from types import MappingProxyType
from xml.etree import ElementTree

SCHEMA_VERSION = "geo-retention-index-evidence-v1"
SUITE = "kr.co.a4ai.gcssaker.authpolicy.GeoRetentionIndexCandidatePostgresTest"
MAX_XML_BYTES = 2 * 1024 * 1024
EXPECTED = MappingProxyType(
    {
        "rows": 100000,
        "insert_rows": 10000,
        "candidate_index_used": 1,
        "candidate_sort_nodes": 0,
        "candidate_temp_written": 0,
    }
)
INTEGER_FIELDS = frozenset(EXPECTED) | frozenset({"baseline_sort_nodes", "baseline_temp_written", "index_bytes"})
DECIMAL_FIELDS = frozenset(
    {
        "build_ms",
        "baseline_plan_ms",
        "candidate_plan_ms",
        "baseline_insert_ms",
        "candidate_insert_ms",
        "baseline_insert_wal",
        "candidate_insert_wal",
    }
)
FIELDS = INTEGER_FIELDS | DECIMAL_FIELDS | frozenset({"result"})


class GeoRetentionIndexEvidenceError(RuntimeError):
    """Candidate index evidence is incomplete or malformed."""


def suite(directory: Path) -> ElementTree.Element:
    path = directory / ("TEST-" + SUITE + ".xml")
    with path.open("rb") as stream:
        payload = stream.read(MAX_XML_BYTES + 1)
    if len(payload) > MAX_XML_BYTES or b"<!DOCTYPE" in payload.upper() or b"<!ENTITY" in payload.upper():
        raise GeoRetentionIndexEvidenceError("suite_xml_unsafe")
    root = ElementTree.fromstring(payload)
    if root.tag != "testsuite" or root.get("name") != SUITE:
        raise GeoRetentionIndexEvidenceError("suite_identity_invalid")
    return root


def counts(root: ElementTree.Element) -> dict[str, int]:
    result = {key: int(root.get(key, "-1")) for key in ("tests", "failures", "errors", "skipped")}
    cases = root.findall("testcase")
    actual = {
        "tests": len(cases),
        **{
            key: sum(case.find(tag) is not None for case in cases)
            for key, tag in (("failures", "failure"), ("errors", "error"), ("skipped", "skipped"))
        },
    }
    if result != actual or result["tests"] <= 0:
        raise GeoRetentionIndexEvidenceError("suite_counts_invalid")
    return result


def measurement_fields(line: str) -> dict[str, str]:
    pairs = [token.split("=", 1) for token in line.split()[1:]]
    fields = dict(pairs)
    if (
        any(len(pair) != 2 for pair in pairs)
        or len(fields) != len(pairs)
        or fields.keys() != FIELDS
        or fields["result"] != "PASS"
    ):
        raise GeoRetentionIndexEvidenceError("measurement_fields_invalid")
    return fields


def measurement_values(fields: dict[str, str]) -> tuple[dict[str, int], dict[str, float]]:
    integers = {key: int(fields[key]) for key in INTEGER_FIELDS}
    decimals = {key: float(fields[key]) for key in DECIMAL_FIELDS}
    if any(value < 0 for value in integers.values()) or any(
        not math.isfinite(value) or value < 0 for value in decimals.values()
    ):
        raise GeoRetentionIndexEvidenceError("measurement_numbers_invalid")
    return integers, decimals


def measurement(line: str) -> dict[str, int | float]:
    integers, decimals = measurement_values(measurement_fields(line))
    if any(integers[key] != value for key, value in EXPECTED.items()):
        raise GeoRetentionIndexEvidenceError("candidate_contract_invalid")
    if integers["baseline_sort_nodes"] < 1 or integers["baseline_temp_written"] < 1 or integers["index_bytes"] < 1:
        raise GeoRetentionIndexEvidenceError("baseline_or_space_evidence_invalid")
    positive = ("baseline_plan_ms", "candidate_plan_ms", "baseline_insert_wal", "candidate_insert_wal")
    if decimals["build_ms"] >= 3000 or any(decimals[key] <= 0 for key in positive):
        raise GeoRetentionIndexEvidenceError("candidate_cost_invalid")
    return {**integers, **decimals}


def build_report(directory: Path, source_commit: str) -> dict[str, object]:
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise GeoRetentionIndexEvidenceError("source_revision_invalid")
    root = suite(directory)
    test_counts = counts(root)
    result = (
        "FAIL" if test_counts["failures"] or test_counts["errors"] else "BLOCKED" if test_counts["skipped"] else "PASS"
    )
    rows = [
        measurement(line)
        for line in root.findtext("system-out", "").splitlines()
        if line.startswith("geo_retention_index ")
    ]
    if result == "PASS" and (test_counts["tests"] != 1 or len(rows) != 1):
        raise GeoRetentionIndexEvidenceError("measurement_missing_or_duplicate")
    return {
        "schema_version": SCHEMA_VERSION,
        "source_commit": source_commit,
        "result": result,
        "tests": test_counts,
        "measurements": rows,
        "scope": "test-only observed_at,id index on pinned PostGIS; one warm-cache 100k plan and sequential 10k inserts; not production qualification",
        "production_schema_change": "NOT_RUN",
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
    except (GeoRetentionIndexEvidenceError, OSError, ValueError, ElementTree.ParseError):
        result = "FAIL"
    print(
        json.dumps({"schema_version": SCHEMA_VERSION, "result": result, "error_code": "geo_index_evidence_unavailable"})
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
