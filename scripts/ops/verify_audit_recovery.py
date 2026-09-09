#!/usr/bin/env python3
"""Verify restored audit chain equality and its signed external anchor."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import stat
from pathlib import Path

from audit_chain_verify import read_json_lines, verify_records


def require_private_key(path: Path) -> bytes:
    if not path.is_file() or path.stat().st_size < 32:
        raise ValueError("audit anchor key is missing or weak")
    if os.name != "nt" and path.stat().st_mode & (stat.S_IRWXG | stat.S_IRWXO):
        raise ValueError("audit anchor key permissions are unsafe")
    return path.read_bytes().strip()


def verify_recovery(original: Path, restored: Path, anchor_path: Path, key_path: Path) -> int:
    original_records = read_json_lines(original)
    restored_records = read_json_lines(restored)
    verify_records(original_records)
    verify_records(restored_records)
    if original_records != restored_records:
        raise ValueError("restored audit records differ from the source export")
    anchor = json.loads(anchor_path.read_text(encoding="utf-8"))
    record_count = len(restored_records)
    chain_head = restored_records[-1]["recordHash"] if restored_records else "0" * 64
    if anchor.get("recordCount") != record_count or anchor.get("chainHead") != chain_head:
        raise ValueError("external anchor does not bind the restored chain head")
    payload = "|".join(
        str(anchor[field])
        for field in ("sequence", "previousAnchorHash", "chainHead", "recordCount", "anchoredAt", "sourceCommit")
    ).encode()
    anchor_hash = hashlib.sha256(payload).hexdigest()
    if not hmac.compare_digest(anchor_hash, str(anchor.get("anchorHash", ""))):
        raise ValueError("external anchor hash is invalid")
    signature = hmac.new(require_private_key(key_path), anchor_hash.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, str(anchor.get("signature", ""))):
        raise ValueError("external anchor signature is invalid")
    return record_count


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--original", required=True, type=Path)
    parser.add_argument("--restored", required=True, type=Path)
    parser.add_argument("--anchor", required=True, type=Path)
    parser.add_argument("--hmac-key-file", required=True, type=Path)
    args = parser.parse_args()
    count = verify_recovery(args.original, args.restored, args.anchor, args.hmac_key_file)
    print(f"audit recovery verified for {count} records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
