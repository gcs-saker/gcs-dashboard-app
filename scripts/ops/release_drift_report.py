#!/usr/bin/env python3
"""Compare immutable release manifests without exposing secret values."""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

COMPARABLE_FIELDS = (
    "commit",
    "composeSha256",
    "sourceComposeSha256",
    "environmentSha256",
    "mqttPasswordFileSha256",
)


def load_manifest(path: pathlib.Path) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("schemaVersion") != 1:
        raise ValueError(f"unsupported release manifest: {path}")
    return value


def migration_map(manifest: dict[str, object]) -> dict[str, str]:
    migrations = manifest.get("flywayMigrations")
    if not isinstance(migrations, list):
        raise ValueError("flywayMigrations must be an array")
    return {
        str(item["path"]): str(item["sha256"])
        for item in migrations
        if isinstance(item, dict) and "path" in item and "sha256" in item
    }


def compare(
    left: dict[str, object], right: dict[str, object]
) -> list[dict[str, object]]:
    differences = [
        {"field": field, "left": left.get(field), "right": right.get(field)}
        for field in COMPARABLE_FIELDS
        if left.get(field) != right.get(field)
    ]
    left_migrations = migration_map(left)
    right_migrations = migration_map(right)
    if left_migrations != right_migrations:
        differences.append(
            {
                "field": "flywayMigrations",
                "leftOnly": sorted(set(left_migrations) - set(right_migrations)),
                "rightOnly": sorted(set(right_migrations) - set(left_migrations)),
                "checksumMismatch": sorted(
                    path
                    for path in set(left_migrations) & set(right_migrations)
                    if left_migrations[path] != right_migrations[path]
                ),
            }
        )
    return differences


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("left", type=pathlib.Path)
    parser.add_argument("right", type=pathlib.Path)
    parser.add_argument("--left-name", default="server-01")
    parser.add_argument("--right-name", default="server-02")
    parser.add_argument("--output", type=pathlib.Path)
    args = parser.parse_args()

    differences = compare(load_manifest(args.left), load_manifest(args.right))
    report = {
        "schemaVersion": 1,
        "left": args.left_name,
        "right": args.right_name,
        "inSync": not differences,
        "differences": differences,
    }
    encoded = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded + "\n", encoding="utf-8")
    print(encoded)
    return 0 if not differences else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"release drift report failed: {error}", file=sys.stderr)
        raise SystemExit(2)
