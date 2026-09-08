import runpy
from datetime import date
from pathlib import Path
from typing import Any, Callable, cast

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE = runpy.run_path(str(REPO_ROOT / "scripts/reports/license_compliance.py"))
LicenseComplianceError = cast(type[BaseException], MODULE["LicenseComplianceError"])
classify_package = cast(Callable[..., tuple[str, str]], MODULE["classify_package"])
build_report = cast(Callable[..., dict[str, Any]], MODULE["build_report"])
notice_markdown = cast(Callable[[dict[str, Any]], str], MODULE["notice_markdown"])

POLICY = {
    "allowedLicenses": ["Apache-2.0", "MIT"],
    "deniedLicenses": ["AGPL-3.0-only", "UNKNOWN"],
    "firstPartyPurlPrefixes": ["pkg:golang/example.invalid/first-party"],
}
TODAY = date(2026, 9, 8)


def package(name: str, license_expression: str, purl: str) -> dict[str, Any]:
    return {
        "name": name,
        "versionInfo": "1.0.0",
        "licenseDeclared": license_expression,
        "externalRefs": [{"referenceType": "purl", "referenceLocator": purl}],
    }


def test_classification_fails_closed_for_denied_unknown_and_unreviewed() -> None:
    assert classify_package(package("ok", "MIT", "pkg:pypi/ok@1"), POLICY, [], TODAY)[0] == "ALLOWED"
    assert classify_package(package("bad", "AGPL-3.0-only", "pkg:pypi/bad@1"), POLICY, [], TODAY)[0] == "DENIED"
    assert classify_package(package("unknown", "NOASSERTION", "pkg:pypi/unknown@1"), POLICY, [], TODAY)[0] == "UNKNOWN"
    assert (
        classify_package(package("review", "LGPL-2.1-only", "pkg:pypi/review@1"), POLICY, [], TODAY)[0]
        == "REVIEW_REQUIRED"
    )


def test_exact_unexpired_approval_records_distribution_obligation() -> None:
    approval = {
        "purl": "pkg:pypi/review@1",
        "licenseExpression": "LGPL-2.1-only",
        "approvedBy": "security-reviewer",
        "expiresAt": "2026-12-31",
        "obligation": "retain notice and provide corresponding source offer",
    }

    disposition, obligation = classify_package(
        package("review", "LGPL-2.1-only", "pkg:pypi/review@1"),
        POLICY,
        [approval],
        TODAY,
    )

    assert disposition == "REVIEW_APPROVED"
    assert "source offer" in obligation


def test_first_party_package_does_not_require_third_party_license() -> None:
    first_party = package("service", "NOASSERTION", "pkg:golang/example.invalid/first-party/service")
    assert classify_package(first_party, POLICY, [], TODAY)[0] == "FIRST_PARTY"


def test_report_and_notices_preserve_blocking_findings(tmp_path: Path) -> None:
    sbom = tmp_path / "image.spdx.json"
    sbom.write_text(
        '{"packages":['
        '{"name":"ok","versionInfo":"1","licenseDeclared":"MIT","externalRefs":[]},'
        '{"name":"unknown","versionInfo":"1","licenseDeclared":"NOASSERTION","externalRefs":[]}'
        "]}",
        encoding="utf-8",
    )

    report = build_report([sbom], POLICY, [], TODAY)
    notices = notice_markdown(report)

    assert report["releaseAllowed"] is False
    assert report["counts"] == {"ALLOWED": 1, "UNKNOWN": 1}
    assert "Disposition: `UNKNOWN`" in notices


def test_invalid_spdx_document_is_rejected(tmp_path: Path) -> None:
    sbom = tmp_path / "invalid.json"
    sbom.write_text("{}", encoding="utf-8")

    with pytest.raises(LicenseComplianceError, match="no SPDX packages"):
        build_report([sbom], POLICY, [], TODAY)
