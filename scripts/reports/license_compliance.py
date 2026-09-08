#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any

import yaml

SPDX_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9.+-]*")
LOGICAL_TOKENS = {"AND", "OR", "WITH"}
UNKNOWN_EXPRESSIONS = {"", "NOASSERTION", "NONE", "UNKNOWN"}


class LicenseComplianceError(AssertionError):
    pass


@dataclass(frozen=True)
class PackageDecision:
    artifact: str
    name: str
    version: str
    purl: str
    license: str
    disposition: str
    obligation: str = ""


def load_yaml(path: Path) -> dict[str, Any]:
    value = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise LicenseComplianceError(f"{path} must contain an object")
    return value


def package_purl(package: dict[str, Any]) -> str:
    for reference in package.get("externalRefs", []):
        if reference.get("referenceType") == "purl":
            return str(reference.get("referenceLocator", ""))
    return ""


def license_tokens(expression: str) -> set[str]:
    return {token for token in SPDX_TOKEN.findall(expression) if token not in LOGICAL_TOKENS}


def active_approval(approvals: list[dict[str, Any]], purl: str, expression: str, today: date) -> dict[str, Any] | None:
    for approval in approvals:
        if approval.get("purl") != purl or approval.get("licenseExpression") != expression:
            continue
        expires = date.fromisoformat(str(approval.get("expiresAt")))
        if expires >= today and approval.get("approvedBy") and approval.get("obligation"):
            return approval
    return None


def classify_package(
    package: dict[str, Any], policy: dict[str, Any], approvals: list[dict[str, Any]], today: date
) -> tuple[str, str]:
    expression = str(package.get("licenseDeclared", "")).strip()
    purl = package_purl(package)
    if any(purl.startswith(prefix) for prefix in policy.get("firstPartyPurlPrefixes", [])):
        return "FIRST_PARTY", ""
    if expression in UNKNOWN_EXPRESSIONS or expression.startswith("LicenseRef-"):
        return "UNKNOWN", "license metadata must be resolved"
    tokens = license_tokens(expression)
    denied = tokens.intersection(policy.get("deniedLicenses", []))
    if denied:
        return "DENIED", f"denied licenses: {', '.join(sorted(denied))}"
    allowed = set(policy.get("allowedLicenses", []))
    if tokens and tokens.issubset(allowed):
        return "ALLOWED", "retain copyright and license notice"
    approval = active_approval(approvals, purl, expression, today)
    if approval:
        return "REVIEW_APPROVED", str(approval["obligation"])
    return "REVIEW_REQUIRED", "legal and distribution-obligation review required"


def scan_sbom(
    path: Path, policy: dict[str, Any], approvals: list[dict[str, Any]], today: date
) -> list[PackageDecision]:
    document = json.loads(path.read_text(encoding="utf-8"))
    packages = document.get("packages")
    if not isinstance(packages, list):
        raise LicenseComplianceError(f"{path} has no SPDX packages")
    decisions: list[PackageDecision] = []
    for package in packages:
        disposition, obligation = classify_package(package, policy, approvals, today)
        decisions.append(
            PackageDecision(
                path.stem,
                str(package.get("name", "unknown")),
                str(package.get("versionInfo", "unknown")),
                package_purl(package),
                str(package.get("licenseDeclared", "NOASSERTION")),
                disposition,
                obligation,
            )
        )
    return decisions


def build_report(
    paths: list[Path], policy: dict[str, Any], approvals: list[dict[str, Any]], today: date
) -> dict[str, Any]:
    decisions = [decision for path in paths for decision in scan_sbom(path, policy, approvals, today)]
    counts: dict[str, int] = {}
    for decision in decisions:
        counts[decision.disposition] = counts.get(decision.disposition, 0) + 1
    return {
        "schemaVersion": "gcs-saker.license-compliance.v1",
        "generatedOn": today.isoformat(),
        "counts": dict(sorted(counts.items())),
        "releaseAllowed": not any(key in counts for key in ("DENIED", "UNKNOWN", "REVIEW_REQUIRED")),
        "packages": [
            asdict(decision)
            for decision in sorted(decisions, key=lambda item: (item.artifact, item.name, item.version))
        ],
    }


def notice_markdown(report: dict[str, Any]) -> str:
    lines = ["# Third-party notices", "", f"Generated: {report['generatedOn']}", ""]
    for package in report["packages"]:
        if package["disposition"] == "FIRST_PARTY":
            continue
        lines.extend(
            [
                f"## {package['name']} {package['version']}",
                "",
                f"- Artifact: `{package['artifact']}`",
                f"- Package URL: `{package['purl'] or 'unavailable'}`",
                f"- Declared license: `{package['license']}`",
                f"- Disposition: `{package['disposition']}`",
                f"- Obligation: {package['obligation']}",
                "",
            ]
        )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sbom", action="append", type=Path, required=True)
    parser.add_argument("--policy", type=Path, required=True)
    parser.add_argument("--approvals", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--notices", type=Path, required=True)
    parser.add_argument("--enforce", action="store_true")
    args = parser.parse_args()
    policy = load_yaml(args.policy)
    approvals = load_yaml(args.approvals).get("approvals", [])
    report = build_report(args.sbom, policy, approvals, date.today())
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.notices.write_text(notice_markdown(report), encoding="utf-8")
    if args.enforce and not report["releaseAllowed"]:
        raise LicenseComplianceError(f"license release gate failed: {report['counts']}")
    print(json.dumps(report["counts"], sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
