#!/usr/bin/env python3
"""Export redacted verification for the shared geo schema migration runner."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from xml.etree import ElementTree

SCHEMA_VERSION = "geo-schema-migration-evidence-v1"
SUITE = "kr.co.a4ai.gcssaker.authpolicy.GeoSchemaMigrationRunnerPostgresTest"
MAX_XML_BYTES = 2 * 1024 * 1024


class GeoSchemaMigrationEvidenceError(RuntimeError):
    """Migration-runner evidence is unavailable or inconsistent."""


def read_suite(directory: Path) -> ElementTree.Element:
    with (directory / ("TEST-" + SUITE + ".xml")).open("rb") as stream:
        payload = stream.read(MAX_XML_BYTES + 1)
    if len(payload) > MAX_XML_BYTES or b"<!DOCTYPE" in payload.upper() or b"<!ENTITY" in payload.upper():
        raise GeoSchemaMigrationEvidenceError("suite_xml_unsafe")
    root = ElementTree.fromstring(payload)
    if root.tag != "testsuite" or root.get("name") != SUITE:
        raise GeoSchemaMigrationEvidenceError("suite_identity_invalid")
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
        raise GeoSchemaMigrationEvidenceError("suite_counts_invalid")
    return counts


def measurement(line: str) -> dict[str, object]:
    fields = dict(token.split("=", 1) for token in line.split()[1:])
    if line.startswith("geo_migration_backup "):
        return backup_measurement(fields)
    return load_measurement(fields)


def backup_measurement(fields: dict[str, str]) -> dict[str, object]:
    expected = {
        "result",
        "dump_bytes",
        "digest_verified",
        "source_tables",
        "restored_tables",
        "migrations",
        "index_valid",
    }
    if fields.keys() != expected or fields.get("result") != "PASS":
        raise GeoSchemaMigrationEvidenceError("backup_measurement_invalid")
    numbers = {key: int(fields[key]) for key in expected - {"result"}}
    valid = numbers["dump_bytes"] > 0 and numbers["digest_verified"] == 1
    valid = valid and numbers["source_tables"] == numbers["restored_tables"]
    if not valid or numbers["migrations"] != 1 or numbers["index_valid"] != 1:
        raise GeoSchemaMigrationEvidenceError("backup_contract_invalid")
    return {"profile": "backup_restore", **numbers}


def load_measurement(fields: dict[str, str]) -> dict[str, object]:
    expected = {
        "result",
        "repetition",
        "rows",
        "writes",
        "reads",
        "write_p95_ms",
        "read_p95_ms",
        "progress_seen",
        "retention_temp_written",
    }
    if fields.keys() != expected or fields.get("result") != "PASS":
        raise GeoSchemaMigrationEvidenceError("load_measurement_invalid")
    integers = {
        key: int(fields[key])
        for key in ("repetition", "rows", "writes", "reads", "progress_seen", "retention_temp_written")
    }
    timings = {key: float(fields[key]) for key in ("write_p95_ms", "read_p95_ms")}
    validate_load_values(integers, timings)
    return {"profile": "concurrent_load", **integers, **timings}


def validate_load_values(integers: dict[str, int], timings: dict[str, float]) -> None:
    expected_integers = {"rows": 500000, "writes": 16, "reads": 16, "progress_seen": 1, "retention_temp_written": 0}
    if (
        integers["repetition"] not in {1, 2, 3}
        or any(integers[key] != value for key, value in expected_integers.items())
        or any(not math.isfinite(value) or value < 0 or value >= 500 for value in timings.values())
    ):
        raise GeoSchemaMigrationEvidenceError("load_contract_invalid")


def verification_result(counts: dict[str, int], measurements: list[dict[str, object]]) -> str:
    if counts["failures"] or counts["errors"]:
        return "FAIL"
    if counts["skipped"]:
        return "BLOCKED"
    repetitions = {row.get("repetition") for row in measurements if row.get("profile") == "concurrent_load"}
    if counts["tests"] != 9 or len(measurements) != 4 or repetitions != {1, 2, 3}:
        raise GeoSchemaMigrationEvidenceError("verification_cases_missing")
    return "PASS"


def build_report(directory: Path, source_commit: str) -> dict[str, object]:
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise GeoSchemaMigrationEvidenceError("source_revision_invalid")
    root = read_suite(directory)
    counts = suite_counts(root)
    measurements = [
        measurement(line)
        for line in root.findtext("system-out", "").splitlines()
        if line.startswith(("geo_migration_backup ", "geo_migration_load "))
    ]
    result = verification_result(counts, measurements)
    return {
        "schema_version": SCHEMA_VERSION,
        "source_commit": source_commit,
        "result": result,
        "tests": counts,
        "measurements": measurements,
        "acceptance_budget": {
            "repetitions": 3,
            "write_p95_ms_max": 500,
            "read_p95_ms_max": 500,
            "retention_temp_written": 0,
        },
        "scope": "shared runner recovery plus custom dump restore and concurrent index read/write on pinned PostGIS",
        "production_execution": "NOT_RUN",
        "backup_restore": "PASS",
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
    except (GeoSchemaMigrationEvidenceError, OSError, ValueError, ElementTree.ParseError):
        result = "FAIL"
    print(
        json.dumps(
            {"schema_version": SCHEMA_VERSION, "result": result, "error_code": "geo_migration_evidence_unavailable"}
        )
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
