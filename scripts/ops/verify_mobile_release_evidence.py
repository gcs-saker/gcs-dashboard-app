#!/usr/bin/env python3
"""Validate the mobile release entry is bound to its archived Sigstore bundle."""

from __future__ import annotations

import argparse
import base64
import json
import re
from pathlib import Path
from typing import Any

IMAGE_REFERENCE = re.compile(
    r"^ghcr\.io/gcs-saker/gcs-mobile-publisher@sha256:([0-9a-f]{64})$"
)
BUNDLE_MEDIA_TYPE = "application/vnd.dev.sigstore.bundle.v0.3+json"
STATEMENT_TYPE = "https://in-toto.io/Statement/v1"
PREDICATE_TYPE = "https://sigstore.dev/cosign/sign/v1"


class MobileEvidenceError(RuntimeError):
    """Raised when archived mobile release evidence is inconsistent."""


def load_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise MobileEvidenceError(f"{path.name} must contain an object")
    return value


def decode_statement(bundle: dict[str, Any]) -> dict[str, Any]:
    envelope = bundle.get("dsseEnvelope")
    if not isinstance(envelope, dict):
        raise MobileEvidenceError("Sigstore bundle is missing its DSSE envelope")
    payload = envelope.get("payload")
    if not isinstance(payload, str):
        raise MobileEvidenceError("DSSE envelope is missing its payload")
    try:
        decoded = base64.b64decode(payload, validate=True).decode("utf-8")
        statement = json.loads(decoded)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MobileEvidenceError("DSSE payload is invalid") from exc
    if not isinstance(statement, dict):
        raise MobileEvidenceError("DSSE payload must contain an object")
    return statement


def validate_subject(statement: dict[str, Any], expected_digest: str) -> None:
    if statement.get("_type") != STATEMENT_TYPE:
        raise MobileEvidenceError("unexpected in-toto statement type")
    if statement.get("predicateType") != PREDICATE_TYPE:
        raise MobileEvidenceError("unexpected Cosign predicate type")
    subjects = statement.get("subject")
    if not isinstance(subjects, list) or len(subjects) != 1:
        raise MobileEvidenceError("statement must bind exactly one subject")
    digest = subjects[0].get("digest") if isinstance(subjects[0], dict) else None
    if not isinstance(digest, dict) or digest.get("sha256") != expected_digest:
        raise MobileEvidenceError("statement subject does not match the mobile image digest")


def verify(entry_path: Path, bundle_path: Path) -> None:
    entry = load_object(entry_path)
    image = entry.get("image")
    match = IMAGE_REFERENCE.fullmatch(image) if isinstance(image, str) else None
    if entry.get("service") != "mobile-publisher" or match is None:
        raise MobileEvidenceError("mobile release entry has an unapproved image reference")
    if entry.get("licenseReleaseAllowed") is not True:
        raise MobileEvidenceError("mobile release entry is not approved for distribution")
    bundle = load_object(bundle_path)
    if bundle.get("mediaType") != BUNDLE_MEDIA_TYPE:
        raise MobileEvidenceError("unsupported Sigstore bundle format")
    if not isinstance(bundle.get("verificationMaterial"), dict):
        raise MobileEvidenceError("Sigstore verification material is missing")
    validate_subject(decode_statement(bundle), match.group(1))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--entry", type=Path, required=True)
    parser.add_argument("--bundle", type=Path, required=True)
    args = parser.parse_args()
    try:
        verify(args.entry, args.bundle)
    except (OSError, json.JSONDecodeError, MobileEvidenceError) as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
