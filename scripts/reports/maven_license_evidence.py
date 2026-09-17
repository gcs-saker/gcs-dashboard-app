#!/usr/bin/env python3
"""Collect exact Maven Central POM license evidence for unresolved SBOM packages."""

from __future__ import annotations

import argparse
import json
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, unquote
from urllib.request import urlopen

MAVEN_PREFIX = "pkg:maven/"
CENTRAL = "https://repo1.maven.org/maven2"
MAX_PARENT_DEPTH = 3
SPDX_BY_POM_NAME = {
    "Apache 2.0": "Apache-2.0",
    "Apache License Version 2.0": "Apache-2.0",
    "Apache License, Version 2.0": "Apache-2.0",
    "Apache-2.0": "Apache-2.0",
    "The Apache License, Version 2.0": "Apache-2.0",
    "The Apache Software License, Version 2.0": "Apache-2.0",
    "BSD-2-Clause": "BSD-2-Clause",
    "BSD-3-Clause": "BSD-3-Clause",
    "Eclipse Distribution License - v 1.0": "EDL-1.0",
    "Eclipse Distribution License v. 1.0": "EDL-1.0",
    "Eclipse Public License - v 2.0": "EPL-2.0",
    "Eclipse Public License v. 2.0": "EPL-2.0",
    "EPL 2.0": "EPL-2.0",
    "EPL-2.0": "EPL-2.0",
    "GNU Library General Public License v2.1 or later": "LGPL-2.1-or-later",
    "GPL2 w/ CPE": "GPL-2.0-only WITH Classpath-exception-2.0",
    "LGPL-2.1-only": "LGPL-2.1-only",
    "MIT": "MIT",
    "MIT license": "MIT",
    "The MIT License (MIT)": "MIT",
    "MIT-0": "MIT-0",
    "Public Domain, per Creative Commons CC0": "CC0-1.0",
}


class MavenLicenseEvidenceError(RuntimeError):
    pass


@dataclass(frozen=True)
class Coordinate:
    group: str
    artifact: str
    version: str

    @property
    def pom_url(self) -> str:
        group_path = "/".join(quote(part, safe="") for part in self.group.split("."))
        artifact = quote(self.artifact, safe=".-_")
        version = quote(self.version, safe=".-_")
        return f"{CENTRAL}/{group_path}/{artifact}/{version}/{artifact}-{version}.pom"


def coordinate_from_purl(purl: str) -> Coordinate:
    if not purl.startswith(MAVEN_PREFIX) or "@" not in purl:
        raise MavenLicenseEvidenceError(f"invalid Maven PURL: {purl}")
    path, version = purl[len(MAVEN_PREFIX) :].rsplit("@", 1)
    group, artifact = path.rsplit("/", 1)
    return Coordinate(unquote(group), unquote(artifact), unquote(version.split("?", 1)[0]))


def fetch_pom(coordinate: Coordinate) -> ET.Element:
    try:
        with urlopen(coordinate.pom_url, timeout=10) as response:
            payload = response.read(2 * 1024 * 1024)
    except (HTTPError, URLError) as error:
        raise MavenLicenseEvidenceError(f"POM unavailable: {coordinate.pom_url}") from error
    try:
        return ET.fromstring(payload)
    except ET.ParseError as error:
        raise MavenLicenseEvidenceError(f"invalid POM XML: {coordinate.pom_url}") from error


def child_text(element: ET.Element, name: str) -> str:
    child = element.find(f"{{*}}{name}")
    return "" if child is None or child.text is None else child.text.strip()


def pom_licenses(root: ET.Element) -> list[dict[str, str]]:
    licenses = []
    for license_element in root.findall("{*}licenses/{*}license"):
        name = child_text(license_element, "name")
        url = child_text(license_element, "url")
        if name or url:
            licenses.append({"name": name, "url": url})
    return licenses


def spdx_expression(licenses: list[dict[str, str]]) -> str | None:
    expressions = []
    for license_record in licenses:
        expression = SPDX_BY_POM_NAME.get(license_record["name"])
        if expression is None:
            return None
        if expression not in expressions:
            expressions.append(expression)
    return " OR ".join(expressions) if expressions else None


def parent_coordinate(root: ET.Element) -> Coordinate | None:
    parent = root.find("{*}parent")
    if parent is None:
        return None
    values = [child_text(parent, field) for field in ("groupId", "artifactId", "version")]
    return Coordinate(*values) if all(values) else None


def resolve_evidence(coordinate: Coordinate) -> dict[str, object]:
    chain = []
    current = coordinate
    for _ in range(MAX_PARENT_DEPTH + 1):
        try:
            root = fetch_pom(current)
        except MavenLicenseEvidenceError as error:
            return {
                "coordinate": asdict(coordinate),
                "licenses": [],
                "pomChain": chain,
                "status": "UNAVAILABLE",
                "error": str(error),
            }
        chain.append(current.pom_url)
        licenses = pom_licenses(root)
        if licenses:
            return {
                "coordinate": asdict(coordinate),
                "licenses": licenses,
                "pomChain": chain,
                "spdxExpression": spdx_expression(licenses),
                "status": "RESOLVED",
            }
        parent = parent_coordinate(root)
        if parent is None:
            break
        current = parent
    return {"coordinate": asdict(coordinate), "licenses": [], "pomChain": chain, "status": "UNRESOLVED"}


def unresolved_maven_purls(report_path: Path) -> list[str]:
    report = json.loads(report_path.read_text(encoding="utf-8"))
    return sorted(
        package["purl"]
        for package in report.get("packages", [])
        if package.get("disposition") == "UNKNOWN" and str(package.get("purl", "")).startswith(MAVEN_PREFIX)
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--license-report", type=Path, required=True)
    args = parser.parse_args()
    records = [resolve_evidence(coordinate_from_purl(purl)) for purl in unresolved_maven_purls(args.license_report)]
    print(json.dumps({"schemaVersion": "gcs-saker.maven-license-evidence.v1", "records": records}, indent=2))
    return 1 if any(record["status"] != "RESOLVED" for record in records) else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except MavenLicenseEvidenceError as error:
        print(f"maven license evidence failed: {error}", file=__import__("sys").stderr)
        raise SystemExit(1)
