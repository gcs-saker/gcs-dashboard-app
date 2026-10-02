#!/usr/bin/env python3
"""Enforce evidence-backed coverage for the seven security hardening areas."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
MATRIX_PATH = REPO_ROOT / "docs/compliance/security/security-hardening-matrix.yml"
EXPECTED_AREAS = {
    "authentication-session",
    "group-media-isolation",
    "remote-command-protection",
    "input-secret-protection",
    "network-exposure",
    "audit-traceability",
    "supply-chain-release",
}
REQUIRED_VALIDATION_TYPES = {
    "authentication-session": {"success", "replay-denial", "cache-boundary"},
    "group-media-isolation": {"cross-group-denial", "identity-mismatch", "talkback-denial"},
    "remote-command-protection": {"replay-denial", "session-mismatch", "expiry-boundary"},
    "input-secret-protection": {"malformed-input", "oversized-input", "disclosure-denial"},
    "network-exposure": {"private-service-denial", "management-port-denial", "closed-network-profile"},
    "audit-traceability": {"tamper-denial", "authentication-denial", "recovery-integrity"},
    "supply-chain-release": {"dependency-audit", "runtime-image-scan", "signed-provenance"},
}
PUBLIC_BIND_PATTERN = re.compile(r"\$\{PUBLIC_HTTP_BIND_ADDR:-127\.0\.0\.1\}:")
LOCAL_BIND_PATTERN = re.compile(r"\$\{LOCAL_BIND_ADDR:-127\.0\.0\.1\}:")


def load_matrix() -> dict:
    return yaml.safe_load(MATRIX_PATH.read_text(encoding="utf-8"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def validate_evidence(control: dict) -> None:
    control_id = control.get("id", "unknown")
    evidence_paths = control.get("evidence", [])
    anchors = control.get("anchors", [])
    require(len(evidence_paths) >= 2, f"{control_id} requires at least two independent evidence files")
    require(anchors, f"{control_id} requires evidence anchors")
    corpus = ""
    for relative_path in evidence_paths:
        path = REPO_ROOT / relative_path
        require(path.is_file(), f"{control_id} evidence is missing: {relative_path}")
        corpus += path.read_text(encoding="utf-8") + "\n"
    for anchor in anchors:
        require(str(anchor) in corpus, f"{control_id} evidence anchor is missing: {anchor}")


def validate_behavior(control: dict) -> None:
    control_id = control.get("id", "unknown")
    area = control.get("area")
    validations = control.get("validations", [])
    actual_types = {validation.get("type") for validation in validations}
    expected_types = REQUIRED_VALIDATION_TYPES.get(area, set())
    require(actual_types == expected_types, f"{control_id} validation types differ from the required boundary checks")
    for validation in validations:
        source = validation.get("source", "")
        selector = validation.get("selector", "")
        path = REPO_ROOT / source
        require(path.is_file(), f"{control_id} validation source is missing: {source}")
        require(
            selector and selector in path.read_text(encoding="utf-8"), f"{control_id} selector is missing: {selector}"
        )


def validate_network_exposure() -> None:
    compose_path = REPO_ROOT / "deploy/compose/compose.single-node.poc.yml"
    compose_text = compose_path.read_text(encoding="utf-8")
    compose = yaml.safe_load(compose_text)
    services = compose["services"]
    for service_name in ("postgres-geo", "redis", "mqtt", "auth-policy", "backend"):
        require(not services[service_name].get("ports"), f"{service_name} must not publish a host port")
    require(PUBLIC_BIND_PATTERN.search(compose_text) is not None, "public HTTP must default to loopback")
    require(len(LOCAL_BIND_PATTERN.findall(compose_text)) >= 4, "direct runtime ports must default to loopback")
    for management_port in ("9997", "9998"):
        published = str(services["mediamtx"].get("ports", []))
        require(management_port not in published, f"MediaMTX management port {management_port} must stay private")


def validate_matrix() -> None:
    matrix = load_matrix()
    require(matrix.get("schemaVersion") == "gcs-saker.security-hardening.v1", "unexpected schema version")
    controls = matrix.get("controls", [])
    areas = {control.get("area") for control in controls}
    require(areas == EXPECTED_AREAS, f"security areas differ: expected={sorted(EXPECTED_AREAS)} actual={sorted(areas)}")
    require(len({control.get("id") for control in controls}) == len(controls), "control IDs must be unique")
    for control in controls:
        validate_evidence(control)
        validate_behavior(control)
    validate_network_exposure()
    print(f"security hardening contract passed for {len(controls)} controls")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate without modifying evidence")
    parser.parse_args()
    validate_matrix()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
