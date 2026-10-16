#!/usr/bin/env python3
"""Retain redacted pgJDBC/pool and keyset authorization test evidence only."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from xml.etree import ElementTree

SCHEMA_VERSION = "telemetry-own-jdbc-evidence-v1"
SUITES = (
    "kr.co.a4ai.gcssaker.authpolicy.TelemetryReadScopeTest",
    "kr.co.a4ai.gcssaker.authpolicy.TelemetryOwnGroupJdbcPostgresTest",
    "kr.co.a4ai.gcssaker.authpolicy.TelemetryPagePostgresTest",
    "kr.co.a4ai.gcssaker.authpolicy.TelemetryCursorCodecTest",
    "kr.co.a4ai.gcssaker.authpolicy.api.TelemetryPageControllerTest",
)
MODES = ("auto", "force_custom_plan", "force_generic_plan")
CASES = ("dense", "sparse", "empty")
MAX_XML_BYTES = 2 * 1024 * 1024
FIELDS = frozenset(
    {
        "result",
        "mode",
        "case",
        "pgjdbc",
        "rows",
        "samples",
        "legacy_p50_ms",
        "bounded_p50_ms",
        "legacy_p95_ms",
        "bounded_p95_ms",
    }
)


class TelemetryOwnEvidenceError(RuntimeError):
    """Evidence cannot establish the owned JDBC/authorization contract."""


def read_suite(path: Path, name: str) -> tuple[dict[str, object], list[str]]:
    if path.stat().st_size > MAX_XML_BYTES:
        raise TelemetryOwnEvidenceError("suite_too_large")
    payload = path.read_bytes()
    if len(payload) > MAX_XML_BYTES or b"<!DOCTYPE" in payload.upper() or b"<!ENTITY" in payload.upper():
        raise TelemetryOwnEvidenceError("suite_xml_unsafe")
    root = ElementTree.fromstring(payload)
    if root.tag != "testsuite" or root.get("name") != name:
        raise TelemetryOwnEvidenceError("suite_identity_invalid")
    counts = {key: int(root.get(key, "-1")) for key in ("tests", "failures", "errors", "skipped")}
    if counts["tests"] <= 0 or any(value < 0 for value in counts.values()):
        raise TelemetryOwnEvidenceError("suite_counts_invalid")
    lines = [line for line in root.findtext("system-out", "").splitlines() if line.startswith("telemetry_own_jdbc ")]
    return {"suite": name.rsplit(".", 1)[-1], **counts}, lines


def measurement(line: str) -> dict[str, object]:
    pairs = [token.split("=", 1) for token in line.split()[1:]]
    if any(len(pair) != 2 for pair in pairs):
        raise TelemetryOwnEvidenceError("measurement_invalid")
    fields = dict(pairs)
    if len(fields) != len(pairs) or fields.keys() != FIELDS or fields["result"] != "PASS":
        raise TelemetryOwnEvidenceError("measurement_fields_invalid")
    if (
        fields["mode"] not in MODES
        or fields["case"] not in CASES
        or not re.fullmatch(r"\d+\.\d+\.\d+", fields["pgjdbc"])
    ):
        raise TelemetryOwnEvidenceError("measurement_profile_invalid")
    rows, samples = int(fields["rows"]), int(fields["samples"])
    timings = {key: float(value) for key, value in fields.items() if key.endswith("_ms")}
    if rows <= 0 or samples < 3 or any(not math.isfinite(value) or value < 0 for value in timings.values()):
        raise TelemetryOwnEvidenceError("measurement_bounds_invalid")
    if any(timings[prefix + "_p95_ms"] < timings[prefix + "_p50_ms"] for prefix in ("legacy", "bounded")):
        raise TelemetryOwnEvidenceError("measurement_percentile_invalid")
    return {
        "mode": fields["mode"],
        "case": fields["case"],
        "pgjdbc": fields["pgjdbc"],
        "rows": rows,
        "samples": samples,
        **timings,
    }


def build_report(directory: Path, source_commit: str) -> dict[str, object]:
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        raise TelemetryOwnEvidenceError("source_revision_invalid")
    suites: list[dict[str, object]] = []
    measurements: list[dict[str, object]] = []
    for name in SUITES:
        suite, lines = read_suite(directory / ("TEST-" + name + ".xml"), name)
        suites.append(suite)
        measurements.extend(measurement(line) for line in lines)
    result = "FAIL" if any(suite["failures"] or suite["errors"] for suite in suites) else "PASS"
    if result == "PASS" and any(suite["skipped"] for suite in suites):
        result = "BLOCKED"
    if result == "PASS":
        expected = {(mode, case) for mode in MODES for case in CASES}
        if len(measurements) != 9 or {(row["mode"], row["case"]) for row in measurements} != expected:
            raise TelemetryOwnEvidenceError("measurement_profiles_missing_or_duplicate")
        if any(len({row[key] for row in measurements}) != 1 for key in ("rows", "samples", "pgjdbc")):
            raise TelemetryOwnEvidenceError("measurement_inputs_inconsistent")
    return {
        "schema_version": SCHEMA_VERSION,
        "source_commit": source_commit,
        "result": result,
        "suites": suites,
        "measurements": measurements,
        "scope": "synthetic real pgJDBC/Hikari pooled reader, DTO/scope/bounds and cursor/controller tests; not a production SLO",
        "production_deployment": "NOT_RUN",
        "physical_media_qualification": "NOT_RUN",
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
    except (TelemetryOwnEvidenceError, OSError, ValueError, ElementTree.ParseError):
        result = "FAIL"
    print(
        json.dumps({"schema_version": SCHEMA_VERSION, "result": result, "error_code": "own_jdbc_evidence_unavailable"})
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
