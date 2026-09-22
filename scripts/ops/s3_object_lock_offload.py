#!/usr/bin/env python3
"""Upload one audit anchor to an S3 Object Lock COMPLIANCE bucket and verify it."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

BUCKET_PATTERN = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
MINIMUM_RETENTION_DAYS = 30


class ObjectLockError(RuntimeError):
    pass


@dataclass(frozen=True)
class OffloadRequest:
    anchor: Path
    bucket: str
    prefix: str
    retention_days: int
    evidence_output: Path
    endpoint_url: str | None = None
    expected_bucket_owner: str | None = None


def run_aws(arguments: list[str]) -> dict[str, Any]:
    command = ["aws", "s3api", *arguments, "--output", "json"]
    result = subprocess.run(command, check=False, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise ObjectLockError("S3 Object Lock request failed")
    try:
        value = json.loads(result.stdout or "{}")
    except json.JSONDecodeError as error:
        raise ObjectLockError("S3 Object Lock response was invalid") from error
    if not isinstance(value, dict):
        raise ObjectLockError("S3 Object Lock response was invalid")
    return value


def endpoint_arguments(request: OffloadRequest) -> list[str]:
    arguments: list[str] = []
    if request.endpoint_url:
        arguments.extend(("--endpoint-url", request.endpoint_url))
    if request.expected_bucket_owner:
        arguments.extend(("--expected-bucket-owner", request.expected_bucket_owner))
    return arguments


def validate_request(request: OffloadRequest) -> None:
    if not request.anchor.is_absolute() or not request.anchor.is_file():
        raise ObjectLockError("audit anchor must be an existing absolute file")
    if not request.evidence_output.is_absolute() or request.evidence_output.exists():
        raise ObjectLockError("evidence path must be new and absolute")
    if not BUCKET_PATTERN.fullmatch(request.bucket):
        raise ObjectLockError("S3 bucket name is invalid")
    if request.retention_days < MINIMUM_RETENTION_DAYS:
        raise ObjectLockError("COMPLIANCE retention must be at least 30 days")
    if request.prefix.startswith("/") or ".." in request.prefix.split("/"):
        raise ObjectLockError("S3 object prefix is invalid")


def require_locked_versioned_bucket(request: OffloadRequest) -> None:
    common = ["--bucket", request.bucket, *endpoint_arguments(request)]
    versioning = run_aws(["get-bucket-versioning", *common])
    lock = run_aws(["get-object-lock-configuration", *common])
    if versioning.get("Status") != "Enabled":
        raise ObjectLockError("S3 bucket versioning is not enabled")
    if lock.get("ObjectLockConfiguration", {}).get("ObjectLockEnabled") != "Enabled":
        raise ObjectLockError("S3 Object Lock is not enabled")


def anchor_digests(path: Path) -> tuple[str, str]:
    payload = path.read_bytes()
    digest = hashlib.sha256(payload).digest()
    return digest.hex(), base64.b64encode(digest).decode("ascii")


def object_key(request: OffloadRequest, digest_hex: str) -> str:
    prefix = request.prefix.strip("/")
    name = f"{request.anchor.stem}-{digest_hex}.json"
    return f"{prefix}/{name}" if prefix else name


def upload_anchor(request: OffloadRequest, key: str, digest_hex: str, retain_until: datetime) -> str:
    response = run_aws(
        [
            "put-object",
            "--bucket",
            request.bucket,
            "--key",
            key,
            "--body",
            str(request.anchor),
            "--checksum-algorithm",
            "SHA256",
            "--object-lock-mode",
            "COMPLIANCE",
            "--object-lock-retain-until-date",
            retain_until.isoformat().replace("+00:00", "Z"),
            "--metadata",
            f"sha256={digest_hex}",
            *endpoint_arguments(request),
        ]
    )
    version_id = response.get("VersionId")
    if not isinstance(version_id, str) or not version_id:
        raise ObjectLockError("S3 upload did not return an object version")
    return version_id


def verify_uploaded_version(
    request: OffloadRequest,
    key: str,
    version_id: str,
    digest_hex: str,
    checksum: str,
    retain_until: datetime,
) -> None:
    response = run_aws(
        [
            "head-object",
            "--bucket",
            request.bucket,
            "--key",
            key,
            "--version-id",
            version_id,
            "--checksum-mode",
            "ENABLED",
            *endpoint_arguments(request),
        ]
    )
    if response.get("ObjectLockMode") != "COMPLIANCE":
        raise ObjectLockError("uploaded anchor is not COMPLIANCE locked")
    actual_until = datetime.fromisoformat(str(response.get("ObjectLockRetainUntilDate", "")).replace("Z", "+00:00"))
    if actual_until < retain_until:
        raise ObjectLockError("uploaded anchor retention is shorter than requested")
    if response.get("ChecksumSHA256") != checksum:
        raise ObjectLockError("uploaded anchor checksum does not match")
    if response.get("Metadata", {}).get("sha256") != digest_hex:
        raise ObjectLockError("uploaded anchor metadata digest does not match")


def write_evidence(path: Path, payload: dict[str, object]) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        json.dump(payload, output, indent=2, sort_keys=True)
        output.write("\n")


def offload(request: OffloadRequest) -> dict[str, object]:
    validate_request(request)
    require_locked_versioned_bucket(request)
    digest_hex, checksum = anchor_digests(request.anchor)
    key = object_key(request, digest_hex)
    retain_until = datetime.now(timezone.utc) + timedelta(days=request.retention_days)
    version_id = upload_anchor(request, key, digest_hex, retain_until)
    verify_uploaded_version(request, key, version_id, digest_hex, checksum, retain_until)
    evidence: dict[str, object] = {
        "schemaVersion": "gcs-saker.s3-object-lock-offload.v1",
        "result": "PASS",
        "bucket": request.bucket,
        "objectKey": key,
        "versionId": version_id,
        "retentionMode": "COMPLIANCE",
        "retainUntil": retain_until.isoformat(),
        "sha256": digest_hex,
    }
    write_evidence(request.evidence_output, evidence)
    return evidence


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--anchor", required=True, type=Path)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--prefix", default="audit-anchors")
    parser.add_argument("--retention-days", type=int, default=365)
    parser.add_argument("--evidence-output", required=True, type=Path)
    parser.add_argument("--endpoint-url")
    parser.add_argument("--expected-bucket-owner")
    args = parser.parse_args()
    request = OffloadRequest(
        args.anchor.resolve(),
        args.bucket,
        args.prefix,
        args.retention_days,
        args.evidence_output.resolve(),
        args.endpoint_url,
        args.expected_bucket_owner,
    )
    result = offload(request)
    print(f"S3 Object Lock offload {result['result']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
