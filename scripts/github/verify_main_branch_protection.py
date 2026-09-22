#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

REQUIRED_CHECKS = {
    "repository-contracts",
    "backend-test",
    "auth-policy-test",
    "media-control-test",
    "frontend-build",
}


class BranchProtectionError(RuntimeError):
    pass


def load_protection(repository: str, branch: str) -> dict[str, Any]:
    result = subprocess.run(
        ["gh", "api", f"repos/{repository}/branches/{branch}/protection"],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    payload = json.loads(result.stdout)
    if not isinstance(payload, dict):
        raise BranchProtectionError("branch protection response must be an object")
    return payload


def load_protection_input(source: str) -> dict[str, Any]:
    raw = sys.stdin.read() if source == "-" else Path(source).read_text(encoding="utf-8")
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise BranchProtectionError("branch protection input must be an object")
    return payload


def validate_protection(payload: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    status_checks = payload.get("required_status_checks") or {}
    contexts = set(status_checks.get("contexts") or [])
    missing_checks = sorted(REQUIRED_CHECKS - contexts)
    if missing_checks:
        failures.append(f"missing required checks: {', '.join(missing_checks)}")
    if status_checks.get("strict") is not True:
        failures.append("required checks must be strict")
    require_enabled(payload, "enforce_admins", failures)
    require_enabled(payload, "required_conversation_resolution", failures)
    require_disabled(payload, "allow_force_pushes", failures)
    require_disabled(payload, "allow_deletions", failures)
    if payload.get("required_pull_request_reviews") is None:
        failures.append("pull requests must be required")
    return failures


def require_enabled(payload: dict[str, Any], field: str, failures: list[str]) -> None:
    if (payload.get(field) or {}).get("enabled") is not True:
        failures.append(f"{field} must be enabled")


def require_disabled(payload: dict[str, Any], field: str, failures: list[str]) -> None:
    if (payload.get(field) or {}).get("enabled") is not False:
        failures.append(f"{field} must be disabled")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", required=True, help="GitHub owner/repository")
    parser.add_argument("--branch", default="main")
    parser.add_argument("--input-json", help="Read an API response from a file or '-' instead of invoking gh")
    args = parser.parse_args()
    payload = (
        load_protection_input(args.input_json) if args.input_json else load_protection(args.repository, args.branch)
    )
    failures = validate_protection(payload)
    if failures:
        raise BranchProtectionError("; ".join(failures))
    print(f"branch protection verified for {args.repository}:{args.branch}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
