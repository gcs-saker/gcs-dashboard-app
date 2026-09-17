#!/usr/bin/env python3
"""Collect package copyright-file hashes from an immutable runtime image."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote


class OsLicenseEvidenceError(RuntimeError):
    pass


SPDX_BY_DEBIAN_LABEL = {
    "Apache-2.0": "Apache-2.0", "BSD-2-clause": "BSD-2-Clause", "BSD-3-clause": "BSD-3-Clause",
    "Expat": "MIT", "GPL-2": "GPL-2.0-only", "GPL-2+": "GPL-2.0-or-later",
    "GPL-3": "GPL-3.0-only", "GPL-3+": "GPL-3.0-or-later", "ISC": "ISC",
    "LGPL-2": "LGPL-2.0-only", "LGPL-2+": "LGPL-2.0-or-later", "LGPL-2.1": "LGPL-2.1-only",
    "LGPL-2.1+": "LGPL-2.1-or-later", "LGPL-3": "LGPL-3.0-only", "LGPL-3+": "LGPL-3.0-or-later",
    "MIT": "MIT", "public-domain": "LicenseRef-Public-Domain",
}


def run(*args: str) -> bytes:
    result = subprocess.run(args, check=False, capture_output=True)
    if result.returncode:
        raise OsLicenseEvidenceError(f"command failed: {args[0]}")
    return result.stdout


def package_name(purl: str) -> str | None:
    if not (purl.startswith("pkg:deb/") or purl.startswith("pkg:apk/")):
        return None
    path = purl.split("@", 1)[0]
    return unquote(path.rsplit("/", 1)[-1])


def unknown_packages(report_path: Path) -> list[str]:
    report = json.loads(report_path.read_text(encoding="utf-8"))
    names = {
        name
        for package in report.get("packages", [])
        if package.get("disposition") == "UNKNOWN"
        if (name := package_name(str(package.get("purl", "")))) is not None
    }
    return sorted(names)


def copyright_record(image: str, package: str) -> dict[str, object]:
    path = f"/usr/share/doc/{package}/copyright"
    result = subprocess.run(
        ["docker", "run", "--rm", "--entrypoint", "cat", image, path],
        check=False,
        capture_output=True,
    )
    if result.returncode:
        return {"package": package, "path": path, "status": "MISSING"}
    labels = declared_license_labels(result.stdout.decode("utf-8", errors="replace"))
    normalized, unresolved = normalize_debian_labels(labels)
    return {
        "package": package,
        "path": path,
        "sha256": hashlib.sha256(result.stdout).hexdigest(),
        "sizeBytes": len(result.stdout),
        "declaredLicenseLabels": labels,
        "normalizedSpdxLicenses": normalized,
        "unresolvedLicenseLabels": unresolved,
        "status": "COLLECTED",
    }


def declared_license_labels(copyright_text: str) -> list[str]:
    labels = {
        match.group(1).strip()
        for line in copyright_text.splitlines()
        if (match := re.match(r"^License:\s*(.+)$", line)) is not None
    }
    return sorted(label for label in labels if label)


def normalize_debian_labels(labels: list[str]) -> tuple[list[str], list[str]]:
    normalized, unresolved = [], []
    for label in labels:
        expression = SPDX_BY_DEBIAN_LABEL.get(label)
        target, value = (normalized, expression) if expression else (unresolved, label)
        if value not in target:
            target.append(value)
    return sorted(normalized), sorted(unresolved)


def copyright_groups(records: list[dict[str, object]]) -> list[dict[str, object]]:
    grouped: dict[str, list[str]] = {}
    for record in records:
        digest = str(record.get("sha256", ""))
        if digest:
            grouped.setdefault(digest, []).append(str(record["package"]))
    return [
        {"sha256": digest, "packages": sorted(packages), "packageCount": len(packages)}
        for digest, packages in sorted(grouped.items())
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--license-report", type=Path, required=True)
    args = parser.parse_args()
    image_id = run("docker", "image", "inspect", args.image, "--format", "{{.Id}}").decode().strip()
    records = [copyright_record(args.image, package) for package in unknown_packages(args.license_report)]
    print(
        json.dumps(
            {
                "schemaVersion": "gcs-saker.os-license-evidence.v1",
                "imageId": image_id,
                "records": records,
                "copyrightGroups": copyright_groups(records),
            }
        )
    )
    return 1 if any(record["status"] != "COLLECTED" for record in records) else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OsLicenseEvidenceError as error:
        print(f"OS license evidence failed: {error}", file=__import__("sys").stderr)
        raise SystemExit(1)
