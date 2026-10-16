#!/usr/bin/env python3
"""Retain and verify the exact official ASD V6R4 XCCDF; never infer CCI identifiers."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SECURITY = Path("docs/compliance/security")
MANIFEST = SECURITY / "sources/asd-stig-v6r4-provenance.json"
ARCHIVE = SECURITY / "sources/U_ASD_V6R4_STIG.zip"
XCCDF = SECURITY / "sources/U_ASD_STIG_V6R4_Manual-xccdf.xml"
CHECKLIST = SECURITY / "asd-stig-v6r4-checklist.json"
OFFICIAL_URL = "https://dl.dod.cyber.mil/wp-content/uploads/stigs/zip/U_SRG-STIG_Library_January_2026.zip"
ARCHIVE_MEMBER = "U_ASD_V6R4_STIG.zip"
XCCDF_MEMBER = "U_ASD_V6R4_Manual_STIG/U_ASD_STIG_V6R4_Manual-xccdf.xml"
NS = {"x": "http://checklists.nist.gov/xccdf/1.1"}
CCI_SYSTEM = "http://cyber.mil/cci"
MAX_XML_BYTES = 2 * 1024 * 1024
MAX_ZIP_BYTES = 4 * 1024 * 1024
MAX_COMPILATION_BYTES = 512 * 1024 * 1024
SCHEMA = "gcs-saker.stig-source-evidence.v1"
VERIFIED_STATUS = "VERIFIED_OFFICIAL_XCCDF_SHA256"


class StigSourceEvidenceError(RuntimeError):
    """Source provenance, identity, or integrity did not meet the pinned baseline."""


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def bounded_read(path: Path, maximum: int) -> bytes:
    if path.stat().st_size > maximum:
        raise StigSourceEvidenceError("source size exceeds bound")
    with path.open("rb") as source:
        payload = source.read(maximum + 1)
    if len(payload) > maximum:
        raise StigSourceEvidenceError("source size exceeds bound")
    return payload


def member_bytes(archive: zipfile.ZipFile, name: str, maximum: int) -> bytes:
    matches = [entry for entry in archive.infolist() if entry.filename == name]
    if len(matches) != 1 or matches[0].is_dir() or matches[0].file_size > maximum:
        raise StigSourceEvidenceError("source ZIP member missing, duplicated, or oversized")
    with archive.open(matches[0]) as member:
        payload = member.read(maximum + 1)
    if len(payload) > maximum:
        raise StigSourceEvidenceError("source ZIP member exceeds bound")
    return payload


def json_object(path: Path) -> dict[str, Any]:
    value = json.loads(bounded_read(path, MAX_XML_BYTES))
    if not isinstance(value, dict):
        raise StigSourceEvidenceError("source metadata must be an object")
    return value


def parse_rules(payload: bytes) -> list[dict[str, Any]]:
    if len(payload) > MAX_XML_BYTES or b"<!DOCTYPE" in payload.upper() or b"<!ENTITY" in payload.upper():
        raise StigSourceEvidenceError("untrusted XML declaration or size")
    try:
        benchmark = ET.fromstring(payload)
    except ET.ParseError as error:
        raise StigSourceEvidenceError("source XML malformed") from error
    if benchmark.tag != "{" + NS["x"] + "}Benchmark" or benchmark.get("id") != "Application_Security_Development_STIG":
        raise StigSourceEvidenceError("source benchmark identity mismatch")
    release = benchmark.findtext("x:plain-text[@id='release-info']", namespaces=NS)
    if benchmark.findtext("x:version", namespaces=NS) != "6" or release != "Release: 4 Benchmark Date: 01 Oct 2025":
        raise StigSourceEvidenceError("source version/release mismatch")
    rules = [parse_rule(group) for group in benchmark.findall("x:Group", NS)]
    for key in ("findingId", "stigId", "ruleId"):
        if not rules or len({rule[key] for rule in rules}) != len(rules):
            raise StigSourceEvidenceError("source rule identities absent or duplicated")
    return sorted(rules, key=lambda rule: rule["findingId"])


def parse_rule(group: ET.Element) -> dict[str, Any]:
    elements = group.findall("x:Rule", NS)
    if len(elements) != 1:
        raise StigSourceEvidenceError("source Group must have exactly one Rule")
    rule = elements[0]
    finding_id, rule_id = group.get("id", ""), rule.get("id", "")
    stig_id = rule.findtext("x:version", namespaces=NS) or ""
    ccis = [entry.text or "" for entry in rule.findall("x:ident", NS) if entry.get("system") == CCI_SYSTEM]
    if (
        not re.fullmatch(r"V-\d+", finding_id)
        or not re.fullmatch(r"SV-\d+r\d+_rule", rule_id)
        or not re.fullmatch(r"APSC-DV-\d{6}", stig_id)
    ):
        raise StigSourceEvidenceError("source rule identity malformed")
    if not ccis or len(set(ccis)) != len(ccis) or any(not re.fullmatch(r"CCI-\d{6}", cci) for cci in ccis):
        raise StigSourceEvidenceError("source CCI absent, malformed, or duplicated")
    return {
        "findingId": finding_id,
        "stigId": stig_id,
        "ruleId": rule_id,
        "severity": rule.get("severity", "").upper(),
        "title": rule.findtext("x:title", namespaces=NS),
        "cciRefs": sorted(ccis),
    }


def verify_baseline(root: Path, payload: bytes, rules: list[dict[str, Any]]) -> None:
    checklist = json_object(root / CHECKLIST)
    if digest(payload) != checklist.get("sourceSha256") or checklist.get("revision") != "V6R4":
        raise StigSourceEvidenceError("source differs from immutable checklist hash")
    entries = checklist.get("rules")
    if not isinstance(entries, list) or any(
        not isinstance(rule, dict) or not isinstance(rule.get("findingId"), str) for rule in entries
    ):
        raise StigSourceEvidenceError("baseline rule metadata malformed")
    baseline = {rule["findingId"]: rule for rule in entries}
    if (
        len(baseline) != 286
        or checklist.get("ruleCount") != 286
        or {rule["findingId"] for rule in rules} != set(baseline)
    ):
        raise StigSourceEvidenceError("source coverage differs from 286-rule baseline")
    for rule in rules:
        if any(rule[key] != baseline[rule["findingId"]].get(key) for key in ("stigId", "ruleId", "severity", "title")):
            raise StigSourceEvidenceError("source rule identity/content differs from checklist")


def validate_source(root: Path) -> dict[str, list[str]]:
    manifest = json_object(root / MANIFEST)
    if manifest.get("schemaVersion") != SCHEMA or manifest.get("officialCompilationUrl") != OFFICIAL_URL:
        raise StigSourceEvidenceError("source provenance identity mismatch")
    if manifest.get("archiveMember") != ARCHIVE_MEMBER or manifest.get("xccdfMember") != XCCDF_MEMBER:
        raise StigSourceEvidenceError("source provenance member mismatch")
    date.fromisoformat(manifest["retrievedAt"])
    if not re.fullmatch(r"[0-9a-f]{64}", manifest.get("compilationSha256", "")):
        raise StigSourceEvidenceError("compilation provenance hash malformed")
    size = manifest.get("compilationBytes")
    if isinstance(size, bool) or not isinstance(size, int) or not 1 <= size <= MAX_COMPILATION_BYTES:
        raise StigSourceEvidenceError("compilation provenance size malformed")
    archive_bytes = bounded_read(root / ARCHIVE, MAX_ZIP_BYTES)
    payload = bounded_read(root / XCCDF, MAX_XML_BYTES)
    if digest(archive_bytes) != manifest.get("archiveSha256") or digest(payload) != manifest.get("xccdfSha256"):
        raise StigSourceEvidenceError("retained source hash mismatch")
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        if member_bytes(archive, XCCDF_MEMBER, MAX_XML_BYTES) != payload:
            raise StigSourceEvidenceError("retained XML differs from source ZIP")
    rules = parse_rules(payload)
    verify_baseline(root, payload, rules)
    if manifest.get("rules") != rules or manifest.get("ruleCount") != len(rules):
        raise StigSourceEvidenceError("generated CCI mapping differs from retained source")
    return {rule["findingId"]: rule["cciRefs"] for rule in rules}


def validate(root: Path = ROOT) -> dict[str, list[str]]:
    try:
        return validate_source(root)
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile) as error:
        raise StigSourceEvidenceError("retained official source unavailable or malformed") from error


def import_compilation(source: Path, retrieved_at: str) -> None:
    date.fromisoformat(retrieved_at)
    if source.stat().st_size > MAX_COMPILATION_BYTES:
        raise StigSourceEvidenceError("compilation size exceeds bound")
    checksum = hashlib.sha256()
    consumed = 0
    with source.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            consumed += len(chunk)
            if consumed > MAX_COMPILATION_BYTES:
                raise StigSourceEvidenceError("compilation grew beyond bound")
            checksum.update(chunk)
    with zipfile.ZipFile(source) as compilation:
        archive_bytes = member_bytes(compilation, ARCHIVE_MEMBER, MAX_ZIP_BYTES)
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        payload = member_bytes(archive, XCCDF_MEMBER, MAX_XML_BYTES)
    rules = parse_rules(payload)
    verify_baseline(ROOT, payload, rules)
    manifest = {
        "schemaVersion": SCHEMA,
        "officialCompilationUrl": OFFICIAL_URL,
        "retrievedAt": retrieved_at,
        "compilationSha256": checksum.hexdigest(),
        "compilationBytes": consumed,
        "archiveMember": ARCHIVE_MEMBER,
        "archiveSha256": digest(archive_bytes),
        "xccdfMember": XCCDF_MEMBER,
        "xccdfSha256": digest(payload),
        "ruleCount": len(rules),
        "rules": rules,
    }
    outputs = {
        ROOT / ARCHIVE: archive_bytes,
        ROOT / XCCDF: payload,
        ROOT / MANIFEST: (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode(),
    }
    for path, content in outputs.items():
        if path.exists() and path.read_bytes() != content:
            raise StigSourceEvidenceError("refusing to overwrite retained source evidence")
    for path, content in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    validate(ROOT)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--import-compilation", type=Path)
    parser.add_argument("--retrieved-at")
    args = parser.parse_args()
    try:
        if args.import_compilation:
            if not args.retrieved_at:
                raise StigSourceEvidenceError("retrieval date required for import")
            import_compilation(args.import_compilation, args.retrieved_at)
        mappings = validate()
        print(
            json.dumps(
                {
                    "result": "PASS",
                    "ruleCount": len(mappings),
                    "cciReferenceCount": sum(map(len, mappings.values())),
                    "revision": "V6R4",
                }
            )
        )
        return 0
    except (StigSourceEvidenceError, OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile) as error:
        print(f"STIG source evidence FAIL: {type(error).__name__}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
