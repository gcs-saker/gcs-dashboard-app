#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
INVENTORY = REPO_ROOT / "docs/compliance/security/attack-surface.yml"
THREAT_MODEL = REPO_ROOT / "docs/compliance/security/threat-model.yml"
REQUIRED_SURFACES = {
    "AS-PUBLIC-TLS",
    "AS-PRODUCTION-SSH",
    "AS-BROWSER",
    "AS-AUTH-REST",
    "AS-MEDIA-REST",
    "AS-COMPAT-REST",
    "AS-GRPC-GATEWAY",
    "AS-MQTT",
    "AS-MEDIA-TRANSPORT",
    "AS-DATA-STORES",
    "AS-FILES-SECRETS",
    "AS-SUPPLY-CHAIN",
    "AS-AI-SIDECAR",
}
REQUIRED_BOUNDARIES = {
    "TB-PUBLIC-EDGE",
    "TB-BROWSER-MEDIA",
    "TB-APPLICATION",
    "TB-SERVICE-DATA",
    "TB-DEVICE",
    "TB-SUPPLY-CHAIN",
    "TB-AI-FUTURE",
}


class AttackSurfaceError(AssertionError):
    pass


def load_yaml(path: Path) -> dict[str, Any]:
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise AttackSurfaceError(f"{path} must contain an object")
    return document


def validate_attack_surface(inventory: dict[str, Any], threat_model: dict[str, Any], root: Path = REPO_ROOT) -> int:
    surfaces = unique_entries(inventory.get("surfaces"), "surface", "id")
    boundaries = unique_entries(threat_model.get("trustBoundaries"), "trust boundary", "id")
    threats = unique_entries(threat_model.get("threats"), "threat", "id")
    if set(surfaces) != REQUIRED_SURFACES:
        raise AttackSurfaceError("attack-surface inventory does not match the required product boundary")
    if set(boundaries) != REQUIRED_BOUNDARIES:
        raise AttackSurfaceError("trust-boundary inventory does not match the required product boundary")
    validate_surface_details(surfaces, root)
    validate_threat_links(threats, boundaries)
    return len(surfaces)


def unique_entries(value: Any, label: str, key: str) -> dict[str, dict[str, Any]]:
    if not isinstance(value, list) or not value:
        raise AttackSurfaceError(f"{label} inventory must be a non-empty list")
    entries = {item[key]: item for item in value if isinstance(item, dict) and isinstance(item.get(key), str)}
    if len(entries) != len(value):
        raise AttackSurfaceError(f"{label} IDs must be unique strings")
    return entries


def validate_surface_details(surfaces: dict[str, dict[str, Any]], root: Path) -> None:
    for surface_id, surface in surfaces.items():
        for field in ("kind", "exposure", "interface", "inputs", "protections", "owner", "evidence"):
            if not surface.get(field):
                raise AttackSurfaceError(f"{surface_id}: missing {field}")
        for reference in surface["evidence"]:
            if not (root / reference).exists():
                raise AttackSurfaceError(f"{surface_id}: evidence path does not exist: {reference}")


def validate_threat_links(threats: dict[str, dict[str, Any]], boundaries: dict[str, dict[str, Any]]) -> None:
    for threat_id, threat in threats.items():
        if not threat.get("requirementIds") or not threat.get("mitigations"):
            raise AttackSurfaceError(f"{threat_id}: requirement and mitigation links are required")
        unknown = set(threat.get("boundaries", [])) - set(boundaries)
        if unknown:
            raise AttackSurfaceError(f"{threat_id}: unknown trust boundaries: {sorted(unknown)}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        parser.error("--check is required")
    checked = validate_attack_surface(load_yaml(INVENTORY), load_yaml(THREAT_MODEL))
    print(f"attack-surface contract passed for {checked} surfaces")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
