#!/usr/bin/env python3
"""Verify a complete directory of signed, sequential audit anchors."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import stat
from datetime import datetime
from pathlib import Path
from typing import Any

ANCHOR_PATTERN = re.compile(r"^anchor-([0-9]{20})\.json$")
GENESIS_HASH = "0" * 64
PAYLOAD_FIELDS = ("sequence", "previousAnchorHash", "chainHead", "recordCount", "anchoredAt", "sourceCommit")


class AuditAnchorError(ValueError):
    pass


def require_private_key(path: Path) -> bytes:
    if not path.is_file() or path.stat().st_size < 32:
        raise AuditAnchorError("audit anchor key is missing or weak")
    if os.name != "nt" and path.stat().st_mode & (stat.S_IRWXG | stat.S_IRWXO):
        raise AuditAnchorError("audit anchor key permissions are unsafe")
    return path.read_bytes().strip()


def canonical_payload(anchor: dict[str, Any]) -> bytes:
    try:
        return "|".join(str(anchor[field]) for field in PAYLOAD_FIELDS).encode()
    except KeyError as error:
        raise AuditAnchorError(f"audit anchor field is missing: {error.args[0]}") from None


def verify_anchor_record(anchor: dict[str, Any], key: bytes) -> str:
    anchor_hash = hashlib.sha256(canonical_payload(anchor)).hexdigest()
    if not hmac.compare_digest(anchor_hash, str(anchor.get("anchorHash", ""))):
        raise AuditAnchorError("audit anchor hash is invalid")
    signature = hmac.new(key, anchor_hash.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, str(anchor.get("signature", ""))):
        raise AuditAnchorError("audit anchor signature is invalid")
    return anchor_hash


def read_anchor(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise AuditAnchorError(f"audit anchor is unreadable: {path.name}") from error
    if not isinstance(value, dict):
        raise AuditAnchorError("audit anchor must contain an object")
    return value


def verify_anchor_directory(
    directory: Path,
    key: bytes,
    expected_commit: str | None = None,
    checkpoint_path: Path | None = None,
) -> int:
    if not directory.is_dir():
        raise AuditAnchorError("audit anchor directory is missing")
    malformed = [path.name for path in directory.glob("anchor-*.json") if not ANCHOR_PATTERN.fullmatch(path.name)]
    if malformed:
        raise AuditAnchorError("malformed audit anchor filename is present")
    paths = sorted(path for path in directory.iterdir() if ANCHOR_PATTERN.fullmatch(path.name))
    if not paths:
        raise AuditAnchorError("no audit anchors are available")
    previous_hash = GENESIS_HASH
    previous_count = -1
    previous_time: datetime | None = None
    for expected_sequence, path in enumerate(paths, start=1):
        match = ANCHOR_PATTERN.fullmatch(path.name)
        assert match is not None
        if int(match.group(1)) != expected_sequence:
            raise AuditAnchorError("audit anchor filename sequence is not contiguous")
        anchor = read_anchor(path)
        if anchor.get("sequence") != expected_sequence:
            raise AuditAnchorError("audit anchor content sequence does not match filename")
        if anchor.get("previousAnchorHash") != previous_hash:
            raise AuditAnchorError("audit anchor previous hash does not match")
        record_count = anchor.get("recordCount")
        if not isinstance(record_count, int) or record_count < previous_count:
            raise AuditAnchorError("audit anchor record count regressed")
        anchored_at = parse_timestamp(anchor.get("anchoredAt"))
        if previous_time is not None and anchored_at < previous_time:
            raise AuditAnchorError("audit anchor timestamp regressed")
        if expected_commit is not None and anchor.get("sourceCommit") != expected_commit:
            raise AuditAnchorError("audit anchor source commit does not match")
        previous_hash = verify_anchor_record(anchor, key)
        previous_count = record_count
        previous_time = anchored_at
    if checkpoint_path is not None:
        verify_checkpoint(checkpoint_path, len(paths), previous_hash)
    return len(paths)


def verify_checkpoint(path: Path, sequence: int, anchor_hash: str) -> None:
    checkpoint = read_anchor(path)
    if checkpoint.get("sequence") != sequence or checkpoint.get("anchorHash") != anchor_hash:
        raise AuditAnchorError("audit anchor checkpoint does not match latest anchor")


def parse_timestamp(value: object) -> datetime:
    if not isinstance(value, str):
        raise AuditAnchorError("audit anchor timestamp is invalid")
    try:
        normalized = re.sub(r"(\.[0-9]{6})[0-9]+(?=Z|[+-][0-9]{2}:[0-9]{2}$)", r"\1", value)
        return datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError as error:
        raise AuditAnchorError("audit anchor timestamp is invalid") from error


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--anchor-directory", required=True, type=Path)
    parser.add_argument("--hmac-key-file", required=True, type=Path)
    parser.add_argument("--expected-source-commit")
    parser.add_argument("--checkpoint-file", type=Path)
    args = parser.parse_args()
    count = verify_anchor_directory(
        args.anchor_directory,
        require_private_key(args.hmac_key_file),
        args.expected_source_commit,
        args.checkpoint_file,
    )
    print(f"audit anchor chain verified for {count} anchors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
