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
    declared_license: str
    license_source: str
    disposition: str
    obligation: str = ""


@dataclass(frozen=True)
class LicenseRules:
    policy: dict[str, Any]
    approvals: list[dict[str, Any]]
    resolutions: dict[str, dict[str, str]]


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
    return {
        token for token in SPDX_TOKEN.findall(expression) if token not in LOGICAL_TOKENS
    }


def load_resolutions(path: Path) -> dict[str, dict[str, str]]:
    entries = load_yaml(path).get("resolutions", [])
    if not isinstance(entries, list):
        raise LicenseComplianceError("license resolutions must be a list")
    resolutions: dict[str, dict[str, str]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise LicenseComplianceError("each license resolution must be an object")
        purl = str(entry.get("purl", "")).strip()
        expression = str(entry.get("licenseExpression", "")).strip()
        source = str(entry.get("source", "")).strip()
        verified_by = str(entry.get("verifiedBy", "")).strip()
        verified_on = str(entry.get("verifiedOn", "")).strip()
        if not purl.startswith("pkg:") or purl in resolutions:
            raise LicenseComplianceError(
                f"invalid or duplicate resolution purl: {purl}"
            )
        if expression in UNKNOWN_EXPRESSIONS or expression.startswith("LicenseRef-"):
            raise LicenseComplianceError(f"invalid resolved license for {purl}")
        if not source.startswith("https://"):
            raise LicenseComplianceError(f"resolution source must use HTTPS for {purl}")
        if not verified_by or not verified_on:
            raise LicenseComplianceError(
                f"resolution audit fields are required for {purl}"
            )
        try:
            date.fromisoformat(verified_on)
        except ValueError as error:
            raise LicenseComplianceError(
                f"invalid verifiedOn date for {purl}"
            ) from error
        resolutions[purl] = {"license": expression, "source": source}
    return resolutions


def effective_license(
    package: dict[str, Any], resolutions: dict[str, dict[str, str]]
) -> tuple[str, str]:
    declared = str(package.get("licenseDeclared", "")).strip()
    resolution = resolutions.get(package_purl(package))
    if declared not in UNKNOWN_EXPRESSIONS and not declared.startswith("LicenseRef-"):
        return declared, "SBOM licenseDeclared"
    if resolution:
        return resolution["license"], resolution["source"]
    return declared, "SBOM licenseDeclared"


def active_approval(
    approvals: list[dict[str, Any]], purl: str, expression: str, today: date
) -> dict[str, Any] | None:
    for approval in approvals:
        if (
            approval.get("purl") != purl
            or approval.get("licenseExpression") != expression
        ):
            continue
        expires = date.fromisoformat(str(approval.get("expiresAt")))
        if (
            expires >= today
            and approval.get("approvedBy")
            and approval.get("obligation")
        ):
            return approval
    return None


def classify_package(
    package: dict[str, Any], rules: LicenseRules, today: date
) -> tuple[str, str, str, str]:
    expression, source = effective_license(package, rules.resolutions)
    purl = package_purl(package)
    if any(
        purl.startswith(prefix)
        for prefix in rules.policy.get("firstPartyPurlPrefixes", [])
    ):
        return "FIRST_PARTY", "", expression, source
    if expression in UNKNOWN_EXPRESSIONS or expression.startswith("LicenseRef-"):
        return "UNKNOWN", "license metadata must be resolved", expression, source
    tokens = license_tokens(expression)
    denied = tokens.intersection(rules.policy.get("deniedLicenses", []))
    if denied:
        return (
            "DENIED",
            f"denied licenses: {', '.join(sorted(denied))}",
            expression,
            source,
        )
    allowed = set(rules.policy.get("allowedLicenses", []))
    if tokens and tokens.issubset(allowed):
        return "ALLOWED", "retain copyright and license notice", expression, source
    approval = active_approval(rules.approvals, purl, expression, today)
    if approval:
        return "REVIEW_APPROVED", str(approval["obligation"]), expression, source
    return (
        "REVIEW_REQUIRED",
        "legal and distribution-obligation review required",
        expression,
        source,
    )


def scan_sbom(path: Path, rules: LicenseRules, today: date) -> list[PackageDecision]:
    document = json.loads(path.read_text(encoding="utf-8"))
    packages = document.get("packages")
    if not isinstance(packages, list):
        raise LicenseComplianceError(f"{path} has no SPDX packages")
    decisions: list[PackageDecision] = []
    for package in packages:
        disposition, obligation, expression, source = classify_package(
            package, rules, today
        )
        decisions.append(
            PackageDecision(
                path.stem,
                str(package.get("name", "unknown")),
                str(package.get("versionInfo", "unknown")),
                package_purl(package),
                expression,
                str(package.get("licenseDeclared", "NOASSERTION")),
                source,
                disposition,
                obligation,
            )
        )
    return decisions


def build_report(paths: list[Path], rules: LicenseRules, today: date) -> dict[str, Any]:
    decisions = [
        decision for path in paths for decision in scan_sbom(path, rules, today)
    ]
    counts: dict[str, int] = {}
    for decision in decisions:
        counts[decision.disposition] = counts.get(decision.disposition, 0) + 1
    return {
        "schemaVersion": "gcs-saker.license-compliance.v2",
        "generatedOn": today.isoformat(),
        "counts": dict(sorted(counts.items())),
        "releaseAllowed": not any(
            key in counts for key in ("DENIED", "UNKNOWN", "REVIEW_REQUIRED")
        ),
        "packages": [
            decision_document(decision)
            for decision in sorted(decisions, key=decision_sort_key)
        ],
    }


def decision_sort_key(decision: PackageDecision) -> tuple[str, str, str]:
    return decision.artifact, decision.name, decision.version


def decision_document(decision: PackageDecision) -> dict[str, str]:
    document = asdict(decision)
    document["declaredLicense"] = document.pop("declared_license")
    document["licenseSource"] = document.pop("license_source")
    return document


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
                f"- Effective license: `{package['license']}`",
                f"- SBOM declared license: `{package['declaredLicense']}`",
                f"- License source: {package['licenseSource']}",
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
    parser.add_argument("--resolutions", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--notices", type=Path, required=True)
    parser.add_argument("--enforce", action="store_true")
    args = parser.parse_args()
    policy = load_yaml(args.policy)
    approvals = load_yaml(args.approvals).get("approvals", [])
    rules = LicenseRules(policy, approvals, load_resolutions(args.resolutions))
    report = build_report(args.sbom, rules, date.today())
    args.report.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    args.notices.write_text(notice_markdown(report), encoding="utf-8")
    if args.enforce and not report["releaseAllowed"]:
        raise LicenseComplianceError(f"license release gate failed: {report['counts']}")
    print(json.dumps(report["counts"], sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
