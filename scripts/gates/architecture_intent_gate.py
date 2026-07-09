#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
INTENT_MATRIX = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_design_intent_matrix.yml"
RUNTIME_STATUS = REPO_ROOT / "docs" / "architecture" / "GCS-Saker_runtime_stack_status.yml"
COMPOSE_FILE = REPO_ROOT / "deploy" / "compose" / "compose.single-node.poc.yml"
NGINX_CONFIG = REPO_ROOT / "deploy" / "nginx" / "single-node.poc.conf"
SCHEMA_VERSION = "architecture-intent-gate-v1"


class ArchitectureIntentError(AssertionError):
    pass


@dataclass(frozen=True)
class GateResult:
    checked_intents: int
    checked_assertions: int

    def to_json(self) -> str:
        return json.dumps(
            {
                "schemaVersion": SCHEMA_VERSION,
                "checkedIntents": self.checked_intents,
                "checkedAssertions": self.checked_assertions,
            },
            ensure_ascii=False,
        )


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        data = yaml.safe_load(file)
    if not isinstance(data, dict):
        raise ArchitectureIntentError(f"{path} must contain a YAML object")
    return data


def read_path_text(path: Path) -> str:
    if path.is_file():
        return path.read_text(encoding="utf-8")
    if path.is_dir():
        chunks: list[str] = []
        for child in sorted(path.rglob("*")):
            if child.is_file() and should_scan_text_file(child):
                chunks.append(child.read_text(encoding="utf-8", errors="ignore"))
        return "\n".join(chunks)
    raise ArchitectureIntentError(f"path does not exist: {path.relative_to(REPO_ROOT)}")


def should_scan_text_file(path: Path) -> bool:
    return path.suffix in {
        ".conf",
        ".go",
        ".graphqls",
        ".java",
        ".js",
        ".jsx",
        ".kt",
        ".md",
        ".proto",
        ".py",
        ".scss",
        ".sh",
        ".ts",
        ".tsx",
        ".txt",
        ".yml",
        ".yaml",
    }


def require_schema(document: dict[str, Any], expected: str, path: Path) -> None:
    actual = document.get("schemaVersion")
    if actual != expected:
        raise ArchitectureIntentError(f"{path.relative_to(REPO_ROOT)} schemaVersion must be {expected}, got {actual}")


def assert_evidence_paths(intent_id: str, evidence_paths: list[str]) -> int:
    for evidence in evidence_paths:
        path = REPO_ROOT / evidence
        if not path.exists():
            raise ArchitectureIntentError(f"{intent_id}: evidence path does not exist: {evidence}")
    return len(evidence_paths)


def assert_required_texts(intent_id: str, required_texts: list[dict[str, str]]) -> int:
    for item in required_texts:
        path = REPO_ROOT / item["path"]
        text = item["text"]
        haystack = read_path_text(path)
        if text not in haystack:
            raise ArchitectureIntentError(f"{intent_id}: required text not found in {item['path']}: {text}")
    return len(required_texts)


def assert_forbidden_texts(intent_id: str, forbidden_texts: list[dict[str, str]]) -> int:
    for item in forbidden_texts:
        path = REPO_ROOT / item["path"]
        text = item["text"]
        haystack = read_path_text(path)
        if text.lower() in haystack.lower():
            raise ArchitectureIntentError(f"{intent_id}: forbidden text found in {item['path']}: {text}")
    return len(forbidden_texts)


def assert_runtime_statuses(intent_id: str, expected_statuses: dict[str, str], runtime_status: dict[str, Any]) -> int:
    stacks = runtime_status.get("stacks", {})
    if not isinstance(stacks, dict):
        raise ArchitectureIntentError("runtime stack status must contain stacks")

    for stack_name, expected_status in expected_statuses.items():
        entry = stacks.get(stack_name)
        if not isinstance(entry, dict):
            raise ArchitectureIntentError(f"{intent_id}: runtime stack is missing: {stack_name}")
        actual_status = entry.get("status")
        if actual_status != expected_status:
            raise ArchitectureIntentError(
                f"{intent_id}: {stack_name} status must be {expected_status}, got {actual_status}"
            )
    return len(expected_statuses)


def assert_compose_active_services(intent_id: str, service_names: list[str], compose: dict[str, Any]) -> int:
    services = compose.get("services", {})
    if not isinstance(services, dict):
        raise ArchitectureIntentError("compose file must contain services")

    for service_name in service_names:
        service = services.get(service_name)
        if not isinstance(service, dict):
            raise ArchitectureIntentError(f"{intent_id}: compose service is missing: {service_name}")
        if "profiles" in service:
            raise ArchitectureIntentError(f"{intent_id}: active service must not require a profile: {service_name}")
    return len(service_names)


def assert_compose_profile_services(intent_id: str, expected_profiles: dict[str, str], compose: dict[str, Any]) -> int:
    services = compose.get("services", {})
    if not isinstance(services, dict):
        raise ArchitectureIntentError("compose file must contain services")

    for service_name, expected_profile in expected_profiles.items():
        service = services.get(service_name)
        if not isinstance(service, dict):
            raise ArchitectureIntentError(f"{intent_id}: compose profile service is missing: {service_name}")
        profiles = service.get("profiles")
        if expected_profile not in profiles:
            raise ArchitectureIntentError(
                f"{intent_id}: {service_name} must include profile {expected_profile}, got {profiles}"
            )
    return len(expected_profiles)


def assert_nginx_routes(intent_id: str, routes: list[dict[str, str]], nginx: str) -> int:
    for route in routes:
        route_path = route["route"]
        route_without_trailing_slash = route_path.rstrip("/")
        route_markers = [
            f"location = {route_without_trailing_slash}",
            f"location {route_path}",
            f"location ^~ {route_path}",
        ]
        if not any(marker in nginx for marker in route_markers):
            raise ArchitectureIntentError(f"{intent_id}: nginx route is missing: {route_path}")

        proxy_pass = route["proxyPass"]
        if f"proxy_pass {proxy_pass}" not in nginx:
            raise ArchitectureIntentError(f"{intent_id}: nginx proxy target is missing: {proxy_pass}")
    return len(routes)


def run_gate() -> GateResult:
    matrix = load_yaml(INTENT_MATRIX)
    runtime_status = load_yaml(RUNTIME_STATUS)
    compose = load_yaml(COMPOSE_FILE)
    nginx = NGINX_CONFIG.read_text(encoding="utf-8")

    require_schema(matrix, "gcs-saker-design-intent-matrix-v1", INTENT_MATRIX)
    require_schema(runtime_status, "gcs-saker-runtime-stack-status-v1", RUNTIME_STATUS)

    intents = matrix.get("intents")
    if not isinstance(intents, list) or not intents:
        raise ArchitectureIntentError("design intent matrix must contain at least one intent")

    checked_assertions = 0
    for intent in intents:
        if not isinstance(intent, dict):
            raise ArchitectureIntentError("each intent must be a YAML object")
        intent_id = str(intent.get("id", "unknown"))
        assertions = intent.get("assertions")
        if not isinstance(assertions, dict):
            raise ArchitectureIntentError(f"{intent_id}: assertions are required")

        checked_assertions += assert_evidence_paths(intent_id, assertions.get("evidencePaths", []))
        checked_assertions += assert_required_texts(intent_id, assertions.get("requiredTexts", []))
        checked_assertions += assert_forbidden_texts(intent_id, assertions.get("forbiddenTexts", []))
        checked_assertions += assert_runtime_statuses(
            intent_id,
            assertions.get("runtimeStackStatuses", {}),
            runtime_status,
        )
        checked_assertions += assert_compose_active_services(
            intent_id,
            assertions.get("composeActiveServices", []),
            compose,
        )
        checked_assertions += assert_compose_profile_services(
            intent_id,
            assertions.get("composeProfileServices", {}),
            compose,
        )
        checked_assertions += assert_nginx_routes(intent_id, assertions.get("nginxRoutes", []), nginx)

    return GateResult(checked_intents=len(intents), checked_assertions=checked_assertions)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate GCS-Saker design intent against repository contracts.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable gate result.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    result = run_gate()
    if args.json:
        print(result.to_json())
    else:
        print(f"Architecture intent gate passed: {result.checked_intents} intents, {result.checked_assertions} assertions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
