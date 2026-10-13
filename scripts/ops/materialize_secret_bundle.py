#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import stat
import sys
import tempfile
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "gcs-saker.encrypted-secret-bundle.v1"
MAX_SECRET_BYTES = 16_384


class SecretMaterializationError(RuntimeError):
    pass


def load_names(path: Path) -> set[str]:
    names = {line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()}
    if not names or any(not name.replace("_", "").isalnum() or name.upper() != name for name in names):
        raise SecretMaterializationError("secret allowlist is invalid")
    return names


def load_bundle(stream: Any) -> dict[str, str]:
    document = json.load(stream)
    if not isinstance(document, dict):
        raise SecretMaterializationError("secret bundle schema is invalid")
    if document.get("schemaVersion") != SCHEMA_VERSION or not isinstance(document.get("secrets"), dict):
        raise SecretMaterializationError("secret bundle schema is invalid")
    return document["secrets"]


def validate_secrets(secrets: dict[str, Any], required: set[str], optional: set[str]) -> dict[str, str]:
    names = set(secrets)
    if not required <= names or not names <= required | optional:
        raise SecretMaterializationError("secret bundle keys do not match the allowlist")
    validated: dict[str, str] = {}
    for name, value in secrets.items():
        if not isinstance(value, str) or not value or len(value.encode("utf-8")) > MAX_SECRET_BYTES:
            raise SecretMaterializationError(f"secret value is invalid: {name}")
        validated[name] = value
    return validated


def validate_output_directory(path: Path) -> None:
    if not path.is_absolute() or not path.is_dir() or path.is_symlink():
        raise SecretMaterializationError("output directory must be an existing absolute directory")
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077 or path.stat().st_uid != os.geteuid():
        raise SecretMaterializationError("output directory must be owner-only")


def write_secret(directory: Path, name: str, value: str, runtime_gid: int | None) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=f".{name}.", dir=directory)
    try:
        if runtime_gid is not None:
            os.fchown(descriptor, -1, runtime_gid)
        os.fchmod(descriptor, 0o440 if runtime_gid is not None else 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(value)
        os.replace(temporary, directory / name)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--allowlist", type=Path, required=True)
    parser.add_argument("--optional-allowlist", type=Path, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    parser.add_argument("--runtime-gid", type=int)
    args = parser.parse_args()
    try:
        validate_output_directory(args.output_directory)
        optional = load_names(args.optional_allowlist)
        secrets = validate_secrets(load_bundle(sys.stdin), load_names(args.allowlist), optional)
        for name, value in secrets.items():
            write_secret(args.output_directory, name, value, args.runtime_gid)
        for name in optional - set(secrets):
            (args.output_directory / name).unlink(missing_ok=True)
    except (OSError, ValueError, json.JSONDecodeError, SecretMaterializationError) as exc:
        print(f"secret materialization failed: {exc}", file=sys.stderr)
        return 1
    print(f"materialized {len(secrets)} service secret files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
