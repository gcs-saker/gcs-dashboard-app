import runpy
from datetime import date
from pathlib import Path
from typing import Any, Callable, cast

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE = runpy.run_path(str(REPO_ROOT / "scripts/reports/license_compliance.py"))
LicenseComplianceError = cast(type[BaseException], MODULE["LicenseComplianceError"])
LicenseRules = cast(Callable[..., Any], MODULE["LicenseRules"])
classify_package = cast(Callable[..., tuple[str, str, str, str]], MODULE["classify_package"])
build_report = cast(Callable[..., dict[str, Any]], MODULE["build_report"])
load_resolutions = cast(Callable[[Path], dict[str, dict[str, str]]], MODULE["load_resolutions"])
notice_markdown = cast(Callable[[dict[str, Any]], str], MODULE["notice_markdown"])

POLICY = {
    "allowedLicenses": ["Apache-2.0", "MIT"],
    "deniedLicenses": ["AGPL-3.0-only", "UNKNOWN"],
    "firstPartyPurlPrefixes": ["pkg:golang/example.invalid/first-party"],
}
TODAY = date(2026, 9, 8)
RULES = LicenseRules(POLICY, [], {})


def package(name: str, license_expression: str, purl: str) -> dict[str, Any]:
    return {
        "name": name,
        "versionInfo": "1.0.0",
        "licenseDeclared": license_expression,
        "licenseConcluded": "NOASSERTION",
        "externalRefs": [{"referenceType": "purl", "referenceLocator": purl}],
    }


def test_classification_fails_closed_for_denied_unknown_and_unreviewed() -> None:
    assert classify_package(package("ok", "MIT", "pkg:pypi/ok@1"), RULES, TODAY)[0] == "ALLOWED"
    assert classify_package(package("bad", "AGPL-3.0-only", "pkg:pypi/bad@1"), RULES, TODAY)[0] == "DENIED"
    assert classify_package(package("unknown", "NOASSERTION", "pkg:pypi/unknown@1"), RULES, TODAY)[0] == "UNKNOWN"
    assert (
        classify_package(package("review", "LGPL-2.1-only", "pkg:pypi/review@1"), RULES, TODAY)[0] == "REVIEW_REQUIRED"
    )


def test_exact_unexpired_approval_records_distribution_obligation() -> None:
    approval = {
        "purl": "pkg:pypi/review@1",
        "licenseExpression": "LGPL-2.1-only",
        "approvedBy": "security-reviewer",
        "expiresAt": "2026-12-31",
        "obligation": "retain notice and provide corresponding source offer",
    }

    disposition, obligation, _, _ = classify_package(
        package("review", "LGPL-2.1-only", "pkg:pypi/review@1"),
        LicenseRules(POLICY, [approval], {}),
        TODAY,
    )

    assert disposition == "REVIEW_APPROVED"
    assert "source offer" in obligation


def test_first_party_package_does_not_require_third_party_license() -> None:
    first_party = package("service", "NOASSERTION", "pkg:golang/example.invalid/first-party/service")
    assert classify_package(first_party, RULES, TODAY)[0] == "FIRST_PARTY"


def test_exact_resolution_reclassifies_unknown_without_overriding_declared_license() -> None:
    purl = "pkg:pypi/example@1"
    rules = LicenseRules(POLICY, [], {purl: {"license": "MIT", "source": "https://example.invalid"}})

    resolved = classify_package(package("example", "NOASSERTION", purl), rules, TODAY)
    declared = classify_package(package("example", "Apache-2.0", purl), rules, TODAY)

    assert resolved[0:3] == ("ALLOWED", "retain copyright and license notice", "MIT")
    assert resolved[3] == "https://example.invalid"
    assert declared[2:] == ("Apache-2.0", "SBOM licenseDeclared")


def test_valid_spdx_conclusion_resolves_missing_declaration_before_catalog_fallback() -> None:
    item = package("embedded", "NOASSERTION", "pkg:maven/example/embedded@1")
    item["licenseConcluded"] = "Apache-2.0"
    rules = LicenseRules(POLICY, [], {item["externalRefs"][0]["referenceLocator"]: {"license": "MIT", "source": "x"}})

    assert classify_package(item, rules, TODAY)[0:4] == (
        "ALLOWED",
        "retain copyright and license notice",
        "Apache-2.0",
        "SBOM licenseConcluded",
    )


def test_resolution_catalog_requires_exact_audited_https_evidence(tmp_path: Path) -> None:
    catalog = tmp_path / "resolutions.yml"
    catalog.write_text(
        "resolutions:\n"
        "  - purl: pkg:pypi/example@1\n"
        "    licenseExpression: MIT\n"
        "    source: http://example.invalid/license\n"
        "    verifiedBy: reviewer\n"
        "    verifiedOn: 2026-09-08\n",
        encoding="utf-8",
    )

    with pytest.raises(LicenseComplianceError, match="must use HTTPS"):
        load_resolutions(catalog)


def test_exact_public_domain_reference_requires_review_instead_of_remaining_unknown() -> None:
    purl = "pkg:maven/aopalliance/aopalliance@1.0"
    rules = LicenseRules(POLICY, [], {purl: {"license": "LicenseRef-Public-Domain", "source": "https://x"}})

    result = classify_package(package("aopalliance", "NOASSERTION", purl), rules, TODAY)

    assert result[0] == "REVIEW_REQUIRED"
    assert result[2] == "LicenseRef-Public-Domain"


def test_report_and_notices_preserve_blocking_findings(tmp_path: Path) -> None:
    sbom = tmp_path / "image.spdx.json"
    sbom.write_text(
        '{"packages":['
        '{"name":"ok","versionInfo":"1","licenseDeclared":"MIT","externalRefs":[]},'
        '{"name":"unknown","versionInfo":"1","licenseDeclared":"NOASSERTION","externalRefs":[]}'
        "]}",
        encoding="utf-8",
    )

    report = build_report([sbom], RULES, TODAY)
    notices = notice_markdown(report)

    assert report["releaseAllowed"] is False
    assert report["internalDeploymentAllowed"] is True
    assert report["counts"] == {"ALLOWED": 1, "UNKNOWN": 1}
    assert "Disposition: `UNKNOWN`" in notices


def test_internal_deployment_still_blocks_explicitly_denied_license(tmp_path: Path) -> None:
    sbom = tmp_path / "denied.spdx.json"
    sbom.write_text(
        '{"packages":[{"name":"denied","versionInfo":"1","licenseDeclared":"AGPL-3.0-only","externalRefs":[]}]}',
        encoding="utf-8",
    )

    report = build_report([sbom], RULES, TODAY)

    assert report["releaseAllowed"] is False
    assert report["internalDeploymentAllowed"] is False


def test_invalid_spdx_document_is_rejected(tmp_path: Path) -> None:
    sbom = tmp_path / "invalid.json"
    sbom.write_text("{}", encoding="utf-8")

    with pytest.raises(LicenseComplianceError, match="no SPDX packages"):
        build_report([sbom], RULES, TODAY)
