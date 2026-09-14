#!/usr/bin/env python3
"""Reconcile synthetic Maven SBOM PURLs with Gradle's resolved runtime graph."""

from __future__ import annotations

import argparse
import json
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote

MAVEN_PURL_PREFIX = "pkg:maven/"


class MavenReconciliationError(RuntimeError):
    """Raised when authoritative dependency matching is ambiguous or invalid."""


@dataclass(frozen=True)
class MavenCoordinate:
    group: str
    name: str
    version: str

    @property
    def purl(self) -> str:
        namespace = quote(self.group, safe=".")
        name = quote(self.name, safe=".-_")
        version = quote(self.version, safe=".-_")
        return f"{MAVEN_PURL_PREFIX}{namespace}/{name}@{version}"


def load_json(path: Path) -> dict[str, Any]:
    document = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise MavenReconciliationError(f"expected JSON object: {path}")
    return document


def load_manifest(path: Path) -> list[MavenCoordinate]:
    dependencies = load_json(path).get("dependencies")
    if not isinstance(dependencies, list):
        raise MavenReconciliationError("manifest dependencies must be a list")
    coordinates = []
    for dependency in dependencies:
        if not isinstance(dependency, dict):
            raise MavenReconciliationError("manifest dependency must be an object")
        values = tuple(str(dependency.get(field, "")).strip() for field in ("group", "name", "version"))
        if not all(values):
            raise MavenReconciliationError("manifest dependency coordinates must be non-empty")
        coordinates.append(MavenCoordinate(*values))
    if len(coordinates) != len(set(coordinates)):
        raise MavenReconciliationError("manifest contains duplicate coordinates")
    return coordinates


def parse_maven_purl(purl: str) -> MavenCoordinate | None:
    if not purl.startswith(MAVEN_PURL_PREFIX) or "@" not in purl:
        return None
    path, version_with_qualifiers = purl[len(MAVEN_PURL_PREFIX) :].rsplit("@", 1)
    if "/" not in path:
        return None
    group, name = path.rsplit("/", 1)
    version = version_with_qualifiers.split("?", 1)[0].split("#", 1)[0]
    return MavenCoordinate(unquote(group), unquote(name), unquote(version))


def package_purl_reference(package: dict[str, Any]) -> dict[str, Any] | None:
    references = package.get("externalRefs", [])
    if not isinstance(references, list):
        raise MavenReconciliationError("package externalRefs must be a list")
    matches = [
        reference
        for reference in references
        if isinstance(reference, dict)
        and reference.get("referenceType") == "purl"
        and str(reference.get("referenceLocator", "")).startswith(MAVEN_PURL_PREFIX)
    ]
    if len(matches) > 1:
        raise MavenReconciliationError(f"package has multiple Maven PURLs: {package.get('name', '')}")
    return matches[0] if matches else None


def reconcile_document(
    sbom: dict[str, Any], coordinates: list[MavenCoordinate]
) -> tuple[dict[str, Any], list[dict[str, str]]]:
    normalized = deepcopy(sbom)
    packages = normalized.get("packages")
    if not isinstance(packages, list):
        raise MavenReconciliationError("SPDX packages must be a list")
    canonical = {coordinate.purl for coordinate in coordinates}
    by_artifact_version: dict[tuple[str, str], list[MavenCoordinate]] = {}
    for coordinate in coordinates:
        by_artifact_version.setdefault((coordinate.name, coordinate.version), []).append(coordinate)
    changes = []
    for package in packages:
        if not isinstance(package, dict):
            raise MavenReconciliationError("SPDX package must be an object")
        reference = package_purl_reference(package)
        if reference is None:
            continue
        original = str(reference["referenceLocator"])
        parsed = parse_maven_purl(original)
        if parsed is None or original in canonical:
            continue
        candidates = by_artifact_version.get((parsed.name, parsed.version), [])
        if len(candidates) > 1:
            raise MavenReconciliationError(f"ambiguous coordinate for {parsed.name}@{parsed.version}")
        if len(candidates) != 1:
            continue
        replacement = candidates[0].purl
        reference["referenceLocator"] = replacement
        changes.append({"spdxId": str(package.get("SPDXID", "")), "originalPurl": original, "canonicalPurl": replacement})
    return normalized, changes


def write_json(path: Path, document: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def validate_correction_count(changes: list[dict[str, str]], expected: int | None) -> None:
    if expected is not None and len(changes) != expected:
        raise MavenReconciliationError(
            f"expected {expected} Maven coordinate corrections, found {len(changes)}"
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sbom", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--expected-corrections", type=int)
    args = parser.parse_args()
    normalized, changes = reconcile_document(load_json(args.sbom), load_manifest(args.manifest))
    validate_correction_count(changes, args.expected_corrections)
    write_json(args.output, normalized)
    write_json(args.report, {"schemaVersion": "gcs-saker.maven-reconciliation.v1", "changes": changes})
    print(json.dumps({"corrected": len(changes)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
