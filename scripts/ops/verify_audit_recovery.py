#!/usr/bin/env python3
"""Verify restored audit chain equality and its signed external anchor."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from audit_anchor_verify import require_private_key, verify_anchor_record
from audit_chain_verify import read_json_lines, verify_records


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
    verify_anchor_record(anchor, require_private_key(key_path))
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
