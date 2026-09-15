#!/usr/bin/env python3
"""Fail-closed release provenance and configuration gate."""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import os
import pathlib
import re
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
RETIRED_PUBLIC_HOSTS = ("a4ai.tplinkdns.com", "a4ai.121-159-26-245.sslip.io")
PUBLIC_ENDPOINT_ENV_KEYS = {
    "MEDIA_CONTROL_EXPECTED_PUBLIC_ORIGIN",
    "MEDIA_CONTROL_PUBLIC_HLS_BASE_URL",
    "MEDIA_CONTROL_PUBLIC_WEBRTC_BASE_URL",
    "MEDIA_CONTROL_STUN_URL",
    "MEDIA_CONTROL_TURN_PRIMARY_URL",
    "MEDIAMTX_PUBLIC_HLS_BASE_URL",
    "MEDIAMTX_PUBLIC_WEBRTC_BASE_URL",
    "MEDIAMTX_WEBRTC_ADDITIONAL_HOSTS",
    "VITE_DEV_PROXY_TARGET",
    "VITE_LOCAL_WEBCAM_WHIP_URL",
    "VITE_WEBRTC_STUN_URL",
}
APPLICATION_IMAGE_REFERENCE = re.compile(
    r"^ghcr\.io/gcs-saker/gcs-saker-(backend|auth-policy|media-control|dashboard)@sha256:[0-9a-f]{64}$"
)
IMMUTABLE_IMAGE_REFERENCE = re.compile(r"^[^\s]+@sha256:[0-9a-f]{64}$")
PLACEHOLDER_IMAGE_DIGEST = "0" * 64
MINIMUM_MFA_SECRET_BYTES = 20


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
        message = (
            "command failed"
            if secret_output
            else (result.stderr.strip() or result.stdout.strip())
        )
        raise RuntimeError(f"{args[0]}: {message}")
    return result.stdout.strip()


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_private_file(
    path: pathlib.Path, *, allowed_read_uid: str | None = None
) -> None:
    if not path.is_file() or path.stat().st_size == 0:
        raise RuntimeError(f"required non-empty file is missing: {path}")
    if os.name == "nt" or not path.stat().st_mode & 0o077:
        return
    if allowed_read_uid is None:
        raise RuntimeError(f"secret file must not be group/world accessible: {path}")

    acl_entries = {
        line.strip()
        for line in run(
            "getfacl", "--absolute-names", "--omit-header", str(path)
        ).splitlines()
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
        raise RuntimeError(
            f"secret file ACL grants access beyond owner and runtime uid {allowed_read_uid}: {path}"
        )


def validate_public_endpoint_environment(path: pathlib.Path) -> None:
    for key, value in read_environment(path).items():
        if key not in PUBLIC_ENDPOINT_ENV_KEYS:
            continue
        if any(host in value for host in RETIRED_PUBLIC_HOSTS):
            raise RuntimeError(f"{key} references a retired production hostname")


def read_environment(path: pathlib.Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def validate_runtime_environment(path: pathlib.Path) -> None:
    values = read_environment(path)
    validate_admin_mfa_secret(values.get("AUTH_POLICY_ADMIN_MFA_SECRET", ""))
    mobile_image = values.get("MOBILE_PUBLISHER_IMAGE", "")
    if not IMMUTABLE_IMAGE_REFERENCE.fullmatch(mobile_image) or mobile_image.endswith(
        PLACEHOLDER_IMAGE_DIGEST
    ):
        raise RuntimeError("MOBILE_PUBLISHER_IMAGE must use an immutable sha256 digest")
    validate_turn_ranges(values)


def validate_admin_mfa_secret(encoded: str) -> None:
    try:
        padding = "=" * ((8 - len(encoded) % 8) % 8)
        decoded = base64.b32decode(encoded.upper() + padding, casefold=True)
    except (binascii.Error, ValueError):
        raise RuntimeError(
            "AUTH_POLICY_ADMIN_MFA_SECRET must be valid Base32"
        ) from None
    if len(decoded) < MINIMUM_MFA_SECRET_BYTES:
        raise RuntimeError(
            "AUTH_POLICY_ADMIN_MFA_SECRET must contain at least 160 bits"
        )


def validate_turn_ranges(values: dict[str, str]) -> None:
    names = (
        "TURN_RELAY_MIN_PORT",
        "TURN_PRIMARY_RELAY_MAX_PORT",
        "TURN_SECONDARY_RELAY_MIN_PORT",
        "TURN_RELAY_MAX_PORT",
        "TURN_PRIMARY_RELAY_HOST_MIN_PORT",
        "TURN_PRIMARY_RELAY_HOST_MAX_PORT",
        "TURN_SECONDARY_RELAY_HOST_MIN_PORT",
        "TURN_SECONDARY_RELAY_HOST_MAX_PORT",
    )
    try:
        ports = {name: int(values[name]) for name in names}
    except (KeyError, ValueError):
        raise RuntimeError(
            "TURN relay ranges must be explicit integer values"
        ) from None
    internal = range_sizes(
        ports,
        "TURN_RELAY_MIN_PORT",
        "TURN_PRIMARY_RELAY_MAX_PORT",
        "TURN_SECONDARY_RELAY_MIN_PORT",
        "TURN_RELAY_MAX_PORT",
    )
    external = range_sizes(
        ports,
        "TURN_PRIMARY_RELAY_HOST_MIN_PORT",
        "TURN_PRIMARY_RELAY_HOST_MAX_PORT",
        "TURN_SECONDARY_RELAY_HOST_MIN_PORT",
        "TURN_SECONDARY_RELAY_HOST_MAX_PORT",
    )
    if internal != external:
        raise RuntimeError("TURN internal and published relay range sizes must match")


def range_sizes(
    values: dict[str, int],
    first_min: str,
    first_max: str,
    second_min: str,
    second_max: str,
) -> tuple[int, int]:
    first = values[first_max] - values[first_min] + 1
    second = values[second_max] - values[second_min] + 1
    if first <= 0 or second <= 0 or values[second_min] != values[first_max] + 1:
        raise RuntimeError("TURN relay ranges must be positive and contiguous")
    return first, second


def migration_inventory() -> list[dict[str, str]]:
    files = sorted(path for root in MIGRATION_ROOTS for path in root.glob("V*__*.sql"))
    if not files:
        raise RuntimeError("no Flyway migrations found")
    inventory = []
    for path in files:
        # Flyway ChecksumCalculator reads UTF-8 text line-by-line and does not feed line separators to CRC32.
        flyway_bytes = "".join(
            path.read_text(encoding="utf-8-sig").splitlines()
        ).encode("utf-8")
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


def validate_applied_migrations(
    applied_path: pathlib.Path, inventory: list[dict[str, object]]
) -> None:
    applied = []
    for line in applied_path.read_text(encoding="utf-8").splitlines():
        version, checksum = line.split("|", 1)
        applied.append(
            {"version": version, "checksum": int(checksum) if checksum else None}
        )
    source_by_version = {
        pathlib.Path(str(item["path"])).name.split("__", 1)[0][1:]: item
        for item in inventory
    }
    for row in applied:
        version = str(row["version"])
        source = source_by_version.get(version)
        if source is None:
            raise RuntimeError(
                f"applied Flyway migration V{version} is absent from checkout"
            )
        if row.get("checksum") is not None and int(row["checksum"]) != int(
            source["flywayChecksum"]
        ):
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
        expected_prefix = f"ghcr.io/gcs-saker/gcs-saker-{service}@sha256:"
        if not APPLICATION_IMAGE_REFERENCE.fullmatch(
            reference
        ) or not reference.startswith(expected_prefix):
            raise RuntimeError(f"{variable} must use a verified digest")
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
    require_private_file(
        mqtt_file, allowed_read_uid=os.environ.get("MOSQUITTO_RUNTIME_UID", "1883")
    )
    validate_public_endpoint_environment(env_file)
    validate_runtime_environment(env_file)
    status = run("git", "status", "--porcelain")
    if status and not args.allow_dirty:
        raise RuntimeError(
            "release checkout is dirty; commit the source before deployment"
        )
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
