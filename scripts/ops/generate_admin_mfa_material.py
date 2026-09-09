#!/usr/bin/env python3
"""Generate owner-only MFA enrollment and recovery material outside the repository."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import pathlib
import secrets

ROOT = pathlib.Path(__file__).resolve().parents[2]


def recovery_code() -> str:
    value = secrets.token_hex(8).upper()
    return "-".join((value[:4], value[4:8], value[8:12], value[12:]))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=pathlib.Path)
    parser.add_argument("--account", default="admin01")
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or ROOT in output.parents:
        parser.error("MFA material must be written outside the repository")
    if output.exists():
        parser.error("refusing to overwrite existing MFA material")
    secret = base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")
    codes = [recovery_code() for _ in range(10)]
    payload = {
        "account": args.account,
        "totpSecretBase32": secret,
        "recoveryCodes": codes,
        "recoveryCodeSha256": [hashlib.sha256(code.encode()).hexdigest() for code in codes],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(payload, stream, indent=2)
        stream.write("\n")
    print(f"MFA material created at {output}; distribute recovery codes through a separate secure channel")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
