#!/usr/bin/env python3
"""Export redacted verification for the shared geo schema migration runner."""

from __future__ import annotations

import argparse
import json
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


def build_report(directory: Path, source_commit: str) -> dict[str, object]:
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise GeoSchemaMigrationEvidenceError("source_revision_invalid")
    counts = suite_counts(read_suite(directory))
    result = "FAIL" if counts["failures"] or counts["errors"] else "BLOCKED" if counts["skipped"] else "PASS"
    if result == "PASS" and counts["tests"] != 5:
        raise GeoSchemaMigrationEvidenceError("verification_cases_missing")
    return {
        "schema_version": SCHEMA_VERSION,
        "source_commit": source_commit,
        "result": result,
        "tests": counts,
        "scope": "shared bootstrap/existing-install runner; apply/rerun/checksum/incompatible-index/disk/lock recovery on pinned PostGIS",
        "production_execution": "NOT_RUN",
        "backup_restore": "NOT_RUN",
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
