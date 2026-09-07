#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


class AuditChainError(AssertionError):
    pass


def canonical_payload(record: dict[str, Any]) -> bytes:
    payload = {key: value for key, value in record.items() if key != "recordHash"}
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def calculate_record_hash(record: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_payload(record)).hexdigest()


def verify_records(records: list[dict[str, Any]]) -> int:
    previous_hash = "0" * 64
    expected_sequence = 1
    for record in records:
        if record.get("sequence") != expected_sequence:
            raise AuditChainError("audit sequence is not contiguous")
        if record.get("previousHash") != previous_hash:
            raise AuditChainError("audit previous hash does not match")
        if record.get("recordHash") != calculate_record_hash(record):
            raise AuditChainError("audit record hash does not match")
        previous_hash = record["recordHash"]
        expected_sequence += 1
    return len(records)


def read_json_lines(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        value = json.loads(line)
        if not isinstance(value, dict):
            raise AuditChainError("audit line must contain an object")
        records.append(value)
    return records


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    checked = verify_records(read_json_lines(args.path))
    print(f"audit hash chain verified for {checked} records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
