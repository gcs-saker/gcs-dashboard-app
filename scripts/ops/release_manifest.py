#!/usr/bin/env python3
"""Create and validate the signed release manifest consumed by deployment."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

SERVICES = {"backend", "auth-policy", "media-control", "dashboard", "mobile-publisher"}
IMAGE_NAMES = {service: f"gcs-saker-{service}" for service in SERVICES}
IMAGE_NAMES["mobile-publisher"] = "gcs-mobile-publisher"
DIGEST = re.compile(r"sha256:[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")
ACTIVE_VEX = Path(__file__).resolve().parents[2] / "docs/compliance/supply-chain/active-vex.json"
RUNTIME_INVENTORY = Path(__file__).resolve().parents[2] / "docs/compliance/supply-chain/runtime-delivery-inventory.json"


class ReleaseManifestError(RuntimeError):
    pass


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ReleaseManifestError(f"{path} must contain an object")
    return value


def create_entry(args: argparse.Namespace) -> dict[str, Any]:
    license_report = load_json(args.license_report)
    if license_report.get("releaseAllowed") is not True:
        raise ReleaseManifestError("license report does not permit release")
    reference = f"{args.image}@{args.digest}"
    if not valid_image_reference(args.service, reference):
        raise ReleaseManifestError("image must be an approved GHCR digest reference")
    return {
        "service": args.service,
        "image": reference,
        "sbomSha256": sha256(args.sbom),
        "licenseReportSha256": sha256(args.license_report),
        "noticesSha256": sha256(args.notices),
        "licenseReleaseAllowed": True,
    }


def assemble_manifest(entries_root: Path, source_commit: str, workflow_run: str) -> dict[str, Any]:
    entries = [load_json(path) for path in sorted(entries_root.rglob("release-entry.json"))]
    services = {str(entry.get("service")) for entry in entries}
    if services != SERVICES or len(entries) != len(SERVICES):
        raise ReleaseManifestError("release entries must cover each application service exactly once")
    manifest = {
        "schemaVersion": "gcs-saker.signed-release.v1",
        "sourceCommit": source_commit,
        "workflowRun": workflow_run,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "images": sorted(entries, key=lambda entry: str(entry["service"])),
        "runtimeInventory": load_json(RUNTIME_INVENTORY),
        "runtimeInventorySha256": sha256(RUNTIME_INVENTORY),
        "vex": load_json(ACTIVE_VEX).get("records", []),
    }
    validate_manifest(manifest, source_commit)
    return manifest


def validate_manifest(manifest: dict[str, Any], expected_commit: str) -> dict[str, str]:
    if manifest.get("schemaVersion") != "gcs-saker.signed-release.v1":
        raise ReleaseManifestError("unsupported release manifest schema")
    if not COMMIT.fullmatch(expected_commit) or manifest.get("sourceCommit") != expected_commit:
        raise ReleaseManifestError("release manifest source commit mismatch")
    images = manifest.get("images")
    if not isinstance(images, list) or len(images) != len(SERVICES):
        raise ReleaseManifestError("release manifest image inventory is incomplete")
    inventory: dict[str, str] = {}
    for entry in images:
        validate_entry(entry)
        inventory[str(entry["service"])] = str(entry["image"])
    if set(inventory) != SERVICES:
        raise ReleaseManifestError("release manifest service inventory is invalid")
    validate_runtime_inventory(manifest)
    validate_vex(manifest.get("vex", []))
    return inventory


def validate_runtime_inventory(manifest: dict[str, Any]) -> None:
    runtime_inventory = manifest.get("runtimeInventory")
    if not isinstance(runtime_inventory, dict):
        raise ReleaseManifestError("release manifest runtime inventory is missing")
    components = runtime_inventory.get("components")
    if not isinstance(components, list) or len(components) < 6:
        raise ReleaseManifestError("release manifest runtime inventory is incomplete")
    if manifest.get("runtimeInventorySha256") != sha256(RUNTIME_INVENTORY):
        raise ReleaseManifestError("release manifest runtime inventory digest is invalid")
    expected = load_json(RUNTIME_INVENTORY)
    if runtime_inventory != expected:
        raise ReleaseManifestError("release manifest runtime inventory does not match source")
    for component in components:
        image = str(component.get("image", ""))
        if "@sha256:" not in image or not component.get("projectLicenses") or not component.get("licenseSource"):
            raise ReleaseManifestError("release manifest runtime component evidence is incomplete")


def validate_entry(entry: dict[str, Any]) -> None:
    service = str(entry.get("service", ""))
    if service not in SERVICES or not valid_image_reference(service, str(entry.get("image", ""))):
        raise ReleaseManifestError("release manifest contains an invalid image entry")
    for field in ("sbomSha256", "licenseReportSha256", "noticesSha256"):
        if not re.fullmatch(r"[0-9a-f]{64}", str(entry.get(field, ""))):
            raise ReleaseManifestError(f"release manifest contains an invalid {field}")
    if entry.get("licenseReleaseAllowed") is not True:
        raise ReleaseManifestError("release manifest contains a blocked license disposition")


def valid_image_reference(service: str, reference: str) -> bool:
    expected_prefix = f"ghcr.io/gcs-saker/{IMAGE_NAMES.get(service, '')}@"
    return reference.startswith(expected_prefix) and DIGEST.fullmatch(reference.removeprefix(expected_prefix)) is not None


def validate_vex(records: Any) -> None:
    if not isinstance(records, list):
        raise ReleaseManifestError("release manifest VEX inventory must be a list")
    required = {
        "vulnerability",
        "component",
        "status",
        "justification",
        "impactStatement",
        "mitigation",
        "owner",
        "approvedBy",
        "expiresAt",
        "removalCondition",
    }
    for record in records:
        if not isinstance(record, dict) or any(not record.get(field) for field in required):
            raise ReleaseManifestError("vulnerability exception lacks approved VEX fields")
        if date.fromisoformat(str(record["expiresAt"])) < date.today():
            raise ReleaseManifestError("vulnerability exception VEX has expired")


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    entry = subparsers.add_parser("entry")
    entry.add_argument("--service", choices=sorted(SERVICES), required=True)
    entry.add_argument("--image", required=True)
    entry.add_argument("--digest", required=True)
    entry.add_argument("--sbom", type=Path, required=True)
    entry.add_argument("--license-report", type=Path, required=True)
    entry.add_argument("--notices", type=Path, required=True)
    entry.add_argument("--output", type=Path, required=True)
    assemble = subparsers.add_parser("assemble")
    assemble.add_argument("--entries-root", type=Path, required=True)
    assemble.add_argument("--source-commit", required=True)
    assemble.add_argument("--workflow-run", required=True)
    assemble.add_argument("--output", type=Path, required=True)
    verify = subparsers.add_parser("verify")
    verify.add_argument("--manifest", type=Path, required=True)
    verify.add_argument("--source-commit", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "entry":
        write_json(args.output, create_entry(args))
    elif args.command == "assemble":
        write_json(
            args.output,
            assemble_manifest(args.entries_root, args.source_commit, args.workflow_run),
        )
    else:
        print(
            json.dumps(
                validate_manifest(load_json(args.manifest), args.source_commit),
                sort_keys=True,
            )
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ReleaseManifestError as error:
        print(f"release manifest failed: {error}", file=__import__("sys").stderr)
        raise SystemExit(1)
