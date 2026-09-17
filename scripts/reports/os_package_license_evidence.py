#!/usr/bin/env python3
"""Collect package copyright-file hashes from an immutable runtime image."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from urllib.parse import unquote


class OsLicenseEvidenceError(RuntimeError):
    pass


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
    return {
        "package": package,
        "path": path,
        "sha256": hashlib.sha256(result.stdout).hexdigest(),
        "sizeBytes": len(result.stdout),
        "status": "COLLECTED",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--license-report", type=Path, required=True)
    args = parser.parse_args()
    image_id = run("docker", "image", "inspect", args.image, "--format", "{{.Id}}").decode().strip()
    records = [copyright_record(args.image, package) for package in unknown_packages(args.license_report)]
    print(json.dumps({"schemaVersion": "gcs-saker.os-license-evidence.v1", "imageId": image_id, "records": records}))
    return 1 if any(record["status"] != "COLLECTED" for record in records) else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OsLicenseEvidenceError as error:
        print(f"OS license evidence failed: {error}", file=__import__("sys").stderr)
        raise SystemExit(1)
