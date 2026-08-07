#!/usr/bin/env python3
"""Fail-closed release provenance and configuration gate."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import zlib
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
COMPOSE = ROOT / "deploy/compose/compose.single-node.poc.yml"
MIGRATION_ROOTS = (
    ROOT / "services/auth-policy/src/main/resources/db/migration",
    ROOT / "services/auth-policy/src/main/resources/db/postgresql-migration",
)


def run(*args: str, secret_output: bool = False) -> str:
    result = subprocess.run(
        args,
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode:
        message = "command failed" if secret_output else (result.stderr.strip() or result.stdout.strip())
        raise RuntimeError(f"{args[0]}: {message}")
    return result.stdout.strip()


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_private_file(path: pathlib.Path, *, allowed_read_uid: str | None = None) -> None:
    if not path.is_file() or path.stat().st_size == 0:
        raise RuntimeError(f"required non-empty file is missing: {path}")
    if os.name == "nt" or not path.stat().st_mode & 0o077:
        return
    if allowed_read_uid is None:
        raise RuntimeError(f"secret file must not be group/world accessible: {path}")

    acl_entries = {
        line.strip()
        for line in run("getfacl", "--absolute-names", "--omit-header", str(path)).splitlines()
        if line.strip()
    }
    expected_acl = {
        "user::rw-",
        f"user:{allowed_read_uid}:r--",
        "group::---",
        "mask::r--",
        "other::---",
    }
    if acl_entries != expected_acl:
        raise RuntimeError(f"secret file ACL grants access beyond owner and runtime uid {allowed_read_uid}: {path}")


def migration_inventory() -> list[dict[str, str]]:
    files = sorted(path for root in MIGRATION_ROOTS for path in root.glob("V*__*.sql"))
    if not files:
        raise RuntimeError("no Flyway migrations found")
    inventory = []
    for path in files:
        # Flyway ChecksumCalculator reads UTF-8 text line-by-line and does not feed line separators to CRC32.
        flyway_bytes = "".join(path.read_text(encoding="utf-8-sig").splitlines()).encode("utf-8")
        checksum = zlib.crc32(flyway_bytes)
        if checksum >= 2**31:
            checksum -= 2**32
        inventory.append(
            {
                "path": str(path.relative_to(ROOT)),
                "sha256": sha256(path),
                "flywayChecksum": checksum,
            }
        )
    return inventory


def validate_applied_migrations(applied_path: pathlib.Path, inventory: list[dict[str, object]]) -> None:
    applied = []
    for line in applied_path.read_text(encoding="utf-8").splitlines():
        version, checksum = line.split("|", 1)
        applied.append({"version": version, "checksum": int(checksum) if checksum else None})
    source_by_version = {pathlib.Path(str(item["path"])).name.split("__", 1)[0][1:]: item for item in inventory}
    for row in applied:
        version = str(row["version"])
        source = source_by_version.get(version)
        if source is None:
            raise RuntimeError(f"applied Flyway migration V{version} is absent from checkout")
        if row.get("checksum") is not None and int(row["checksum"]) != int(source["flywayChecksum"]):
            raise RuntimeError(f"Flyway checksum drift detected for V{version}")


def application_image_inventory(commit: str) -> dict[str, str]:
    image_variables = {
        "backend": "BACKEND_IMAGE",
        "auth-policy": "AUTH_POLICY_IMAGE",
        "media-control": "MEDIA_CONTROL_IMAGE",
        "dashboard": "DASHBOARD_IMAGE",
    }
    images = {}
    for service, variable in image_variables.items():
        reference = os.environ.get(variable, "")
        if not reference:
            raise RuntimeError(f"{variable} must identify the release image")
        if "@sha256:" not in reference and not reference.endswith(f":{commit}"):
            raise RuntimeError(f"{variable} must use a digest or the exact source commit tag")
        images[service] = reference
    return images


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", required=True, type=pathlib.Path)
    parser.add_argument("--mqtt-password-file", required=True, type=pathlib.Path)
    parser.add_argument("--output", type=pathlib.Path)
    parser.add_argument("--allow-dirty", action="store_true")
    parser.add_argument("--applied-flyway-tsv", type=pathlib.Path)
    args = parser.parse_args()

    env_file = args.env_file.resolve()
    mqtt_file = args.mqtt_password_file.resolve()
    require_private_file(env_file)
    require_private_file(mqtt_file, allowed_read_uid=os.environ.get("MOSQUITTO_RUNTIME_UID", "1883"))
    status = run("git", "status", "--porcelain")
    if status and not args.allow_dirty:
        raise RuntimeError("release checkout is dirty; commit the source before deployment")
    commit = run("git", "rev-parse", "HEAD")
    branch = run("git", "branch", "--show-current")
    compose_rendered = run(
        "docker",
        "compose",
        "--env-file",
        str(env_file),
        "-f",
        str(COMPOSE),
        "config",
        secret_output=True,
    )
    migrations = migration_inventory()
    if args.applied_flyway_tsv:
        validate_applied_migrations(args.applied_flyway_tsv.resolve(), migrations)
    manifest = {
        "schemaVersion": 1,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "commit": commit,
        "branch": branch,
        "composeSha256": hashlib.sha256(compose_rendered.encode()).hexdigest(),
        "sourceComposeSha256": sha256(COMPOSE),
        "environmentSha256": sha256(env_file),
        "mqttPasswordFileSha256": sha256(mqtt_file),
        "applicationImages": application_image_inventory(commit),
        "flywayMigrations": migrations,
    }
    encoded = json.dumps(manifest, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded + "\n", encoding="utf-8")
    print(encoded)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"release gate failed: {error}", file=sys.stderr)
        raise SystemExit(1)
