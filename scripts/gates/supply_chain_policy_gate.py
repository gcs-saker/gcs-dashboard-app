#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
POLICY = REPO_ROOT / "docs/compliance/supply-chain/supply-chain-policy.yml"
VEX = REPO_ROOT / "docs/compliance/supply-chain/vex-template.yml"
REQUIRED_ARTIFACTS = {"backend-image", "auth-policy-image", "media-control-image", "dashboard-image"}


class SupplyChainPolicyError(AssertionError):
    pass


def load_yaml(path: Path) -> dict[str, Any]:
    document = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise SupplyChainPolicyError(f"{path} must contain an object")
    return document


def validate_supply_chain(policy: dict[str, Any], vex: dict[str, Any]) -> int:
    requirements = policy.get("requirements", {})
    for field in (
        "lockfilesRequired",
        "containerBaseDigestRequired",
        "eolRuntimeBlocked",
        "unusedDependencyRemovalRequired",
    ):
        if requirements.get(field) is not True:
            raise SupplyChainPolicyError(f"{field} must fail closed")
    if requirements.get("vex") != "REQUIRED_FOR_EVERY_EXCEPTION":
        raise SupplyChainPolicyError("every vulnerability exception requires VEX")
    if "UNKNOWN" not in policy.get("deniedLicenses", []):
        raise SupplyChainPolicyError("unknown licenses must be denied")
    artifacts = {item.get("id"): item for item in policy.get("artifacts", [])}
    if set(artifacts) != REQUIRED_ARTIFACTS:
        raise SupplyChainPolicyError("all release images require a supply-chain disposition")
    validate_vex(vex)
    return len(artifacts)


def validate_vex(vex: dict[str, Any]) -> None:
    required = (
        "vulnerability",
        "component",
        "status",
        "justification",
        "impactStatement",
        "mitigation",
        "owner",
        "approvedBy",
        "expiresAt",
        "removalCondition",
    )
    for field in required:
        if not vex.get(field):
            raise SupplyChainPolicyError(f"VEX template is missing {field}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if not args.check:
        parser.error("--check is required")
    checked = validate_supply_chain(load_yaml(POLICY), load_yaml(VEX))
    print(f"supply-chain policy contract passed for {checked} release artifacts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
