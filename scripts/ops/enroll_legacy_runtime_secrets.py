#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import secrets
import sys
from pathlib import Path

from materialize_secret_bundle import (
    SecretMaterializationError,
    load_names,
    validate_output_directory,
    validate_secrets,
    write_secret,
)

DISABLED_SIGNUP_POLICY = "disabled"
GENERATED_PASSWORD_BYTES = 48


def parse_value(raw_value: str) -> str:
    value = raw_value.strip()
    if len(value) >= 2 and value[0] == value[-1] == "'":
        return value[1:-1]
    if len(value) >= 2 and value[0] == value[-1] == '"':
        parsed = json.loads(value)
        if not isinstance(parsed, str):
            raise SecretMaterializationError("quoted environment value is invalid")
        return parsed
    return value


def read_environment(path: Path) -> dict[str, str]:
    if not path.is_absolute() or not path.is_file() or path.is_symlink():
        raise SecretMaterializationError("legacy environment source is invalid")
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line.removeprefix("export ").lstrip()
        if "=" not in line:
            raise SecretMaterializationError("legacy environment entry is invalid")
        name, raw_value = line.split("=", 1)
        normalized_name = name.strip()
        if not normalized_name or normalized_name in values:
            raise SecretMaterializationError(
                "legacy environment key is invalid or duplicated"
            )
        values[normalized_name] = parse_value(raw_value)
    return values


def collect_secrets(
    primary: Path, supplements: list[Path], allowed: set[str]
) -> dict[str, str]:
    combined = read_environment(primary)
    for supplement in supplements:
        for name, value in read_environment(supplement).items():
            combined.setdefault(name, value)
    return {name: value for name, value in combined.items() if name in allowed}


def ensure_empty_target(directory: Path, allowed: set[str]) -> None:
    existing = allowed.intersection(item.name for item in directory.iterdir())
    if existing:
        raise SecretMaterializationError(
            "runtime secret target already contains managed files"
        )


def enroll(args: argparse.Namespace) -> int:
    required = load_names(args.allowlist)
    optional = load_names(args.optional_allowlist)
    validate_output_directory(args.output_directory)
    ensure_empty_target(args.output_directory, required | optional)
    enrolled = collect_secrets(
        args.primary_env, args.supplement_env, required | optional
    )
    generated_password = False
    if args.disable_signup:
        enrolled["AUTH_POLICY_SIGNUP_INVITES"] = DISABLED_SIGNUP_POLICY
    if args.generate_mediamtx_password and "MEDIAMTX_API_PASSWORD" not in enrolled:
        enrolled["MEDIAMTX_API_PASSWORD"] = secrets.token_urlsafe(
            GENERATED_PASSWORD_BYTES
        )
        generated_password = True
    validated = validate_secrets(enrolled, required, optional)
    for name, value in validated.items():
        write_secret(args.output_directory, name, value, args.runtime_gid)
    print(
        f"enrolled {len(validated)} runtime secret files; "
        f"generatedMediaPassword={str(generated_password).lower()}; "
        f"signupDisabled={str(args.disable_signup).lower()}",
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--primary-env", type=Path, required=True)
    parser.add_argument("--supplement-env", type=Path, action="append", default=[])
    parser.add_argument("--allowlist", type=Path, required=True)
    parser.add_argument("--optional-allowlist", type=Path, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    parser.add_argument("--runtime-gid", type=int, required=True)
    parser.add_argument("--disable-signup", action="store_true")
    parser.add_argument("--generate-mediamtx-password", action="store_true")
    args = parser.parse_args()
    try:
        return enroll(args)
    except (
        OSError,
        ValueError,
        json.JSONDecodeError,
        SecretMaterializationError,
    ) as exc:
        print(f"runtime secret enrollment failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
